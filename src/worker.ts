const API_PROXY_PREFIX = '/api-proxy'
const PROMPT_CASES_PATH = '/prompt-cases'
const API_PROXY_BASE_URL_HEADER = 'x-api-base-url'
const API_PROXY_TRANSPORT_HEADER = 'x-api-proxy-transport'
const API_PROXY_TRANSPORT_EVENT_STREAM = 'event-stream'
const API_PROXY_HEARTBEAT_MS = 15_000
const PROMPT_CASE_DATASET_URL = 'https://raw.githubusercontent.com/sunlightcold/gpt_image_playground/main/public/data/gpt-image-2/cases.json'
const PROMPT_CASE_CACHE_TTL_SECONDS = 600
const USER_AGENT = 'gpt-image-playground-prompt-cases'

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}

type WorkerCacheStorage = CacheStorage & {
  default?: Cache
}

const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]

function isApiProxyPath(pathname: string): boolean {
  return pathname === API_PROXY_PREFIX || pathname.startsWith(`${API_PROXY_PREFIX}/`)
}

function isPromptCasesPath(pathname: string): boolean {
  return pathname === PROMPT_CASES_PATH
}

function withDatasetRefreshParam(url: string): string {
  const separator = url.includes('?') ? '&' : '?'
  const bucket = Math.floor(Date.now() / (PROMPT_CASE_CACHE_TTL_SECONDS * 1000))
  return `${url}${separator}refresh=${bucket}`
}

function createPromptCaseHeaders(source: string, etag = ''): Headers {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Vary', 'Origin')
  headers.set('X-Prompt-Cases-Source', source)
  if (etag) headers.set('ETag', etag)
  return headers
}

async function handlePromptCases(request: Request, env: Env, ctx?: WorkerExecutionContext): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'accept, content-type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonError(request, 405, 'Prompt case dataset only supports GET or HEAD')
  }

  const cache = (caches as WorkerCacheStorage).default
  if (!cache) {
    return fetchPromptCaseDataset(request, env, true)
  }
  const cacheRequest = new Request(withDatasetRefreshParam(PROMPT_CASE_DATASET_URL), {
    headers: { Accept: 'application/json' },
  })
  const cached = await cache.match(cacheRequest)
  if (cached) {
    return request.method === 'HEAD'
      ? new Response(null, { status: cached.status, statusText: cached.statusText, headers: cached.headers })
      : cached
  }

  try {
    const upstream = await fetch(cacheRequest, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    })
    if (!upstream.ok) throw new Error(`Prompt case dataset request failed: ${upstream.status} ${upstream.statusText}`)

    const body = await upstream.text()
    const response = new Response(request.method === 'HEAD' ? null : body, {
      status: 200,
      headers: createPromptCaseHeaders('remote', upstream.headers.get('etag') ?? ''),
    })
    const cacheResponse = new Response(body, {
      status: 200,
      headers: createPromptCaseHeaders('remote', upstream.headers.get('etag') ?? ''),
    })
    const cacheWrite = cache.put(cacheRequest, cacheResponse).catch(() => undefined)
    if (ctx) {
      ctx.waitUntil(cacheWrite)
    } else {
      await cacheWrite
    }
    return response
  } catch {
    return fetchPromptCaseDataset(request, env, false)
  }
}

async function fetchPromptCaseDataset(request: Request, env: Env, useRemote: boolean): Promise<Response> {
  if (useRemote) {
    const upstream = await fetch(withDatasetRefreshParam(PROMPT_CASE_DATASET_URL), {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    })
    if (upstream.ok) {
      return new Response(request.method === 'HEAD' ? null : await upstream.text(), {
        status: 200,
        headers: createPromptCaseHeaders('remote', upstream.headers.get('etag') ?? ''),
      })
    }
  }

  const assetFallback = await env.ASSETS.fetch(new Request(new URL('/data/gpt-image-2/cases.json', request.url).toString()))
  if (assetFallback.ok) {
    return new Response(request.method === 'HEAD' ? null : assetFallback.body, {
      status: 200,
      headers: createPromptCaseHeaders('fallback'),
    })
  }
  return jsonError(request, 502, 'Prompt case dataset request failed')
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers()
  const origin = request.headers.get('Origin') ?? '*'
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  headers.set(
    'Access-Control-Allow-Headers',
    request.headers.get('Access-Control-Request-Headers') ?? 'authorization, content-type, x-api-base-url, x-api-proxy-transport',
  )
  headers.set('Access-Control-Max-Age', '86400')
  headers.set('Vary', 'Origin, Access-Control-Request-Headers')
  return headers
}

function jsonError(request: Request, status: number, message: string): Response {
  const headers = corsHeaders(request)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify({ error: { message } }), { status, headers })
}

function normalizeDynamicBaseUrl(value: string): URL {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('缺少动态代理目标 API URL')

  const input = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  const url = new URL(input)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('动态代理目标仅支持 http/https URL')
  }
  url.hash = ''
  return url
}

function joinPath(basePath: string, endpointPath: string): string {
  const left = basePath.replace(/\/+$/, '')
  const right = endpointPath.replace(/^\/+/, '')
  return `/${[left.replace(/^\/+/, ''), right].filter(Boolean).join('/')}`
}

function createTargetUrl(requestUrl: URL, baseUrlValue: string): string {
  const endpointPath = requestUrl.pathname.slice(API_PROXY_PREFIX.length).replace(/^\/+/, '')
  if (!endpointPath) throw new Error('缺少 API 代理路径')

  const target = normalizeDynamicBaseUrl(baseUrlValue)
  target.pathname = joinPath(target.pathname, endpointPath)
  target.search = requestUrl.search
  return target.toString()
}

function createUpstreamHeaders(request: Request): Headers {
  const headers = new Headers(request.headers)
  headers.delete(API_PROXY_BASE_URL_HEADER)
  headers.delete(API_PROXY_TRANSPORT_HEADER)
  headers.delete('host')
  headers.delete('origin')
  headers.delete('referer')
  headers.delete('content-length')
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header)
  return headers
}

function createProxyStreamHeaders(request: Request): Headers {
  const headers = corsHeaders(request)
  headers.set('Content-Type', 'text/event-stream; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Accel-Buffering', 'no')
  headers.set(API_PROXY_TRANSPORT_HEADER, API_PROXY_TRANSPORT_EVENT_STREAM)
  return headers
}

function encodeServerSentEvent(event: string, payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

function createSerializableHeaders(headers: Headers): [string, string][] {
  const result: [string, string][] = []
  for (const [key, value] of headers) {
    if (!HOP_BY_HOP_HEADERS.includes(key.toLowerCase())) result.push([key, value])
  }
  return result
}

function createApiProxyStreamResponse(request: Request, targetUrl: string, init: RequestInit): Response {
  let interval: ReturnType<typeof setInterval> | undefined
  let upstreamController: AbortController | undefined

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: Record<string, unknown>) => {
        controller.enqueue(encodeServerSentEvent(event, payload))
      }

      upstreamController = new AbortController()
      interval = setInterval(() => {
        send('ping', { ts: Date.now() })
      }, API_PROXY_HEARTBEAT_MS)
      send('ping', { ts: Date.now() })

      try {
        const upstream = await fetch(targetUrl, {
          ...init,
          signal: upstreamController.signal,
        })
        send('response-start', {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: createSerializableHeaders(upstream.headers),
        })

        if (upstream.body) {
          const reader = upstream.body.getReader()
          const decoder = new TextDecoder()
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            if (chunk) send('body', { chunk })
          }
          const tail = decoder.decode()
          if (tail) send('body', { chunk: tail })
        }

        send('response-end', {})
      } catch (error) {
        if (!upstreamController.signal.aborted) {
          send('error', {
            message: error instanceof Error ? error.message : 'API 代理请求失败',
          })
        }
      } finally {
        if (interval) clearInterval(interval)
        controller.close()
      }
    },
    cancel() {
      if (interval) clearInterval(interval)
      upstreamController?.abort()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: createProxyStreamHeaders(request),
  })
}

function createProxyResponse(request: Request, upstream: Response): Response {
  const headers = new Headers(upstream.headers)
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header)
  for (const [key, value] of corsHeaders(request)) headers.set(key, value)
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

async function handleApiProxy(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) })
  }

  const requestUrl = new URL(request.url)
  const baseUrl = request.headers.get(API_PROXY_BASE_URL_HEADER)
  if (!baseUrl) return jsonError(request, 400, `缺少 ${API_PROXY_BASE_URL_HEADER} 请求头`)

  let targetUrl: string
  try {
    targetUrl = createTargetUrl(requestUrl, baseUrl)
  } catch (error) {
    return jsonError(request, 400, error instanceof Error ? error.message : '动态代理目标 URL 无效')
  }

  const init: RequestInit = {
    method: request.method,
    headers: createUpstreamHeaders(request),
    redirect: 'follow',
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
  }

  if (request.headers.get(API_PROXY_TRANSPORT_HEADER) === API_PROXY_TRANSPORT_EVENT_STREAM) {
    return createApiProxyStreamResponse(request, targetUrl, init)
  }

  const upstream = await fetch(targetUrl, init)
  return createProxyResponse(request, upstream)
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (isPromptCasesPath(url.pathname)) return handlePromptCases(request, env, ctx)
    if (isApiProxyPath(url.pathname)) return handleApiProxy(request)
    return env.ASSETS.fetch(request)
  },
}
