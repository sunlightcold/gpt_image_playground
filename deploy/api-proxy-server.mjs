import http from 'node:http'
import dns from 'node:dns'
import { readFile } from 'node:fs/promises'

dns.setDefaultResultOrder('ipv4first')

const API_PROXY_PREFIX = '/api-proxy'
const PROMPT_CASES_PATH = '/prompt-cases'
const API_PROXY_BASE_URL_HEADER = 'x-api-base-url'
const API_PROXY_TRANSPORT_HEADER = 'x-api-proxy-transport'
const API_PROXY_TRANSPORT_EVENT_STREAM = 'event-stream'
const DEFAULT_API_PROXY_URL = 'https://img.proxy2it.com/v1'
const DEFAULT_PROMPT_CASE_DATASET_URL = 'https://raw.githubusercontent.com/sunlightcold/gpt_image_playground/main/public/data/gpt-image-2/cases.json'
const DEFAULT_PROMPT_CASE_DATASET_FALLBACK_FILE = '/usr/share/nginx/html/data/gpt-image-2/cases.json'
const USER_AGENT = 'gpt-image-playground-prompt-cases'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const REWRITTEN_BODY_HEADERS = new Set([
  'content-encoding',
  'content-length',
])

function getEnvNumber(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const host = process.env.API_PROXY_SERVER_HOST || '127.0.0.1'
const port = getEnvNumber('API_PROXY_SERVER_PORT', 8787)
const heartbeatMs = getEnvNumber('API_PROXY_HEARTBEAT_MS', 15_000)
const promptCasesCacheTtlMs = getEnvNumber('PROMPT_CASE_DATASET_CACHE_SECONDS', 600) * 1000
let promptCasesCache = null

function isEnabled(value) {
  return value === 'true'
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return value[0] || ''
  return value || ''
}

function getConfiguredApiProxyUrl() {
  return process.env.API_PROXY_URL || process.env.API_URL || DEFAULT_API_PROXY_URL
}

function getPromptCaseDatasetUrl() {
  return process.env.PROMPT_CASE_DATASET_URL || DEFAULT_PROMPT_CASE_DATASET_URL
}

function getPromptCaseDatasetFallbackFile() {
  return process.env.PROMPT_CASE_DATASET_FALLBACK_FILE || DEFAULT_PROMPT_CASE_DATASET_FALLBACK_FILE
}

function withDatasetRefreshParam(url) {
  const separator = url.includes('?') ? '&' : '?'
  const bucket = Math.floor(Date.now() / promptCasesCacheTtlMs)
  return `${url}${separator}refresh=${bucket}`
}

function createPromptCasesHeaders(source, etag = '') {
  const headers = [
    ['Content-Type', 'application/json; charset=utf-8'],
    ['Cache-Control', 'public, max-age=300, stale-while-revalidate=86400'],
    ['Access-Control-Allow-Origin', '*'],
    ['Vary', 'Origin'],
    ['X-Prompt-Cases-Source', source],
  ]
  if (etag) headers.push(['ETag', etag])
  return headers
}

function writePromptCasesResponse(request, response, status, body, source, etag = '') {
  writeHeaders(response, createPromptCasesHeaders(source, etag))
  response.writeHead(status)
  if (request.method === 'HEAD') {
    response.end()
    return
  }
  response.end(body)
}

async function fetchPromptCaseDataset() {
  const sourceUrl = getPromptCaseDatasetUrl()
  const now = Date.now()
  if (promptCasesCache?.sourceUrl === sourceUrl && promptCasesCache.expiresAt > now) {
    return promptCasesCache
  }

  const upstream = await fetch(withDatasetRefreshParam(sourceUrl), {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  })
  if (!upstream.ok) {
    throw new Error(`Prompt case dataset request failed: ${upstream.status} ${upstream.statusText}`)
  }

  const nextCache = {
    sourceUrl,
    body: await upstream.text(),
    etag: upstream.headers.get('etag') || '',
    expiresAt: now + promptCasesCacheTtlMs,
  }
  promptCasesCache = nextCache
  return nextCache
}

async function readPromptCaseDatasetFallback() {
  const fallbackFile = getPromptCaseDatasetFallbackFile()
  return {
    sourceUrl: fallbackFile,
    body: await readFile(fallbackFile, 'utf8'),
    etag: '',
    expiresAt: Date.now() + promptCasesCacheTtlMs,
  }
}

async function handlePromptCases(request, response) {
  if (request.method === 'OPTIONS') {
    writeHeaders(response, [
      ['Access-Control-Allow-Origin', '*'],
      ['Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS'],
      ['Access-Control-Allow-Headers', 'accept, content-type'],
      ['Access-Control-Max-Age', '86400'],
    ])
    response.writeHead(204)
    response.end()
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJsonError(request, response, 405, 'Prompt case dataset only supports GET or HEAD')
    return
  }

  try {
    const dataset = await fetchPromptCaseDataset()
    writePromptCasesResponse(request, response, 200, dataset.body, 'remote', dataset.etag)
  } catch (remoteError) {
    try {
      const fallback = await readPromptCaseDatasetFallback()
      promptCasesCache = fallback
      writePromptCasesResponse(request, response, 200, fallback.body, 'fallback')
    } catch {
      sendJsonError(request, response, 502, remoteError instanceof Error ? remoteError.message : 'Prompt case dataset request failed')
    }
  }
}

function getRequestBaseUrl(request) {
  if (isEnabled(process.env.LOCK_API_PROXY)) {
    return getConfiguredApiProxyUrl()
  }

  const dynamicBaseUrl = firstHeaderValue(request.headers[API_PROXY_BASE_URL_HEADER])
  return dynamicBaseUrl || getConfiguredApiProxyUrl()
}

function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) throw new Error('缺少 API 代理目标地址')

  const input = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  const url = new URL(input)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API 代理目标仅支持 http/https URL')
  }
  url.hash = ''
  return url
}

function joinPath(basePath, endpointPath) {
  const left = basePath.replace(/\/+$/, '').replace(/^\/+/, '')
  const right = endpointPath.replace(/^\/+/, '')
  return `/${[left, right].filter(Boolean).join('/')}`
}

function createTargetUrl(request) {
  const requestUrl = new URL(request.url || '/', 'http://localhost')
  const pathname = requestUrl.pathname
  if (pathname === API_PROXY_PREFIX || pathname === `${API_PROXY_PREFIX}/`) {
    throw new Error('缺少 API 代理路径')
  }
  if (!pathname.startsWith(`${API_PROXY_PREFIX}/`)) {
    throw new Error('无效的 API 代理路径')
  }

  const endpointPath = pathname.slice(API_PROXY_PREFIX.length).replace(/^\/+/, '')
  const target = normalizeBaseUrl(getRequestBaseUrl(request))
  target.pathname = joinPath(target.pathname, endpointPath)
  target.search = requestUrl.search
  return target
}

function createCorsHeaders(request) {
  const origin = firstHeaderValue(request.headers.origin) || '*'
  return [
    ['Access-Control-Allow-Origin', origin],
    ['Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS'],
    [
      'Access-Control-Allow-Headers',
      firstHeaderValue(request.headers['access-control-request-headers']) ||
        'authorization, content-type, x-api-base-url, x-api-proxy-transport',
    ],
    ['Access-Control-Max-Age', '86400'],
    ['Vary', 'Origin, Access-Control-Request-Headers'],
  ]
}

function writeHeaders(response, headers) {
  for (const [key, value] of headers) {
    response.setHeader(key, value)
  }
}

function sendJsonError(request, response, status, message) {
  writeHeaders(response, createCorsHeaders(request))
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ error: { message } }))
}

function createUpstreamHeaders(request) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(request.headers)) {
    const lower = key.toLowerCase()
    if (
      lower === API_PROXY_BASE_URL_HEADER ||
      lower === API_PROXY_TRANSPORT_HEADER ||
      lower === 'host' ||
      lower === 'origin' ||
      lower === 'referer' ||
      lower === 'content-length' ||
      HOP_BY_HOP_HEADERS.has(lower)
    ) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else if (value) {
      headers.set(key, value)
    }
  }
  return headers
}

function createFetchInit(request, signal) {
  const init = {
    method: request.method,
    headers: createUpstreamHeaders(request),
    redirect: 'follow',
    signal,
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request
    init.duplex = 'half'
  }

  return init
}

function createSerializableHeaders(headers) {
  const result = []
  for (const [key, value] of headers) {
    const lower = key.toLowerCase()
    if (!HOP_BY_HOP_HEADERS.has(lower) && !REWRITTEN_BODY_HEADERS.has(lower)) result.push([key, value])
  }
  return result
}

function writeSse(response, event, payload) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

function isClientAbortError(error) {
  return error instanceof Error && error.name === 'AbortError'
}

async function proxyWrappedStream(request, response, targetUrl, fetchInit, upstreamController) {
  writeHeaders(response, createCorsHeaders(request))
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
    [API_PROXY_TRANSPORT_HEADER]: API_PROXY_TRANSPORT_EVENT_STREAM,
  })
  response.flushHeaders?.()

  const heartbeat = setInterval(() => {
    writeSse(response, 'ping', { ts: Date.now() })
  }, heartbeatMs)
  writeSse(response, 'ping', { ts: Date.now() })

  try {
    const upstream = await fetch(targetUrl, fetchInit)
    writeSse(response, 'response-start', {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: createSerializableHeaders(upstream.headers),
    })

    if (upstream.body) {
      const decoder = new TextDecoder()
      for await (const value of upstream.body) {
        const chunk = decoder.decode(value, { stream: true })
        if (chunk) writeSse(response, 'body', { chunk })
      }
      const tail = decoder.decode()
      if (tail) writeSse(response, 'body', { chunk: tail })
    }

    writeSse(response, 'response-end', {})
  } catch (error) {
    if (!upstreamController.signal.aborted || !isClientAbortError(error)) {
      writeSse(response, 'error', {
        message: error instanceof Error ? error.message : 'API 代理请求失败',
      })
    }
  } finally {
    clearInterval(heartbeat)
    response.end()
  }
}

async function proxyDirect(request, response, targetUrl, fetchInit) {
  const upstream = await fetch(targetUrl, fetchInit)
  writeHeaders(response, createCorsHeaders(request))
  for (const [key, value] of upstream.headers) {
    const lower = key.toLowerCase()
    if (!HOP_BY_HOP_HEADERS.has(lower) && !REWRITTEN_BODY_HEADERS.has(lower)) response.setHeader(key, value)
  }
  response.writeHead(upstream.status, upstream.statusText)

  if (!upstream.body) {
    response.end()
    return
  }

  for await (const value of upstream.body) {
    if (!response.write(value)) {
      await new Promise((resolve) => response.once('drain', resolve))
    }
  }
  response.end()
}

async function handleApiProxy(request, response) {
  if (request.method === 'OPTIONS') {
    writeHeaders(response, createCorsHeaders(request))
    response.writeHead(204)
    response.end()
    return
  }

  let targetUrl
  try {
    targetUrl = createTargetUrl(request)
  } catch (error) {
    sendJsonError(request, response, 400, error instanceof Error ? error.message : 'API 代理目标地址无效')
    return
  }

  const upstreamController = new AbortController()
  request.on('aborted', () => {
    upstreamController.abort()
  })
  response.on('close', () => {
    if (!response.writableEnded) upstreamController.abort()
  })

  const fetchInit = createFetchInit(request, upstreamController.signal)
  try {
    if (firstHeaderValue(request.headers[API_PROXY_TRANSPORT_HEADER]) === API_PROXY_TRANSPORT_EVENT_STREAM) {
      await proxyWrappedStream(request, response, targetUrl, fetchInit, upstreamController)
    } else {
      await proxyDirect(request, response, targetUrl, fetchInit)
    }
  } catch (error) {
    if (!response.headersSent) {
      sendJsonError(request, response, 502, error instanceof Error ? error.message : 'API 代理请求失败')
    } else if (!response.writableEnded) {
      response.destroy(error instanceof Error ? error : undefined)
    }
  }
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost')
  if (requestUrl.pathname === PROMPT_CASES_PATH) {
    handlePromptCases(request, response).catch((error) => {
      if (!response.headersSent) {
        sendJsonError(request, response, 500, error instanceof Error ? error.message : 'Prompt case dataset request failed')
      } else {
        response.destroy(error instanceof Error ? error : undefined)
      }
    })
    return
  }

  if (!requestUrl.pathname.startsWith(API_PROXY_PREFIX)) {
    sendJsonError(request, response, 404, 'Not Found')
    return
  }

  handleApiProxy(request, response).catch((error) => {
    if (!response.headersSent) {
      sendJsonError(request, response, 500, error instanceof Error ? error.message : 'API 代理内部错误')
    } else {
      response.destroy(error instanceof Error ? error : undefined)
    }
  })
})

server.requestTimeout = 0
server.timeout = 0
server.headersTimeout = 0

server.listen(port, host, () => {
  console.log(`api proxy server listening on http://${host}:${port}${API_PROXY_PREFIX}`)
})
