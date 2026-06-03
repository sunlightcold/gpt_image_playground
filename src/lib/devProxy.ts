import { readRuntimeEnv } from './runtimeEnv'

export interface DevProxyConfig {
  enabled: boolean
  prefix: string
  target: string
  changeOrigin: boolean
  secure: boolean
  dynamic?: boolean
}

const DEFAULT_PROXY_PREFIX = '/api-proxy'
export const API_PROXY_BASE_URL_HEADER = 'x-api-base-url'
export const API_PROXY_TRANSPORT_HEADER = 'x-api-proxy-transport'
export const API_PROXY_TRANSPORT_EVENT_STREAM = 'event-stream'

interface ApiProxyHeaderOptions {
  streamResponse?: boolean
}

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) return ''

  const input = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const url = new URL(input)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const v1Index = pathSegments.indexOf('v1')
    const normalizedSegments = v1Index >= 0
      ? pathSegments.slice(0, v1Index + 1)
      : pathSegments.length
        ? [...pathSegments, 'v1']
        : []
    const pathname = normalizedSegments.length ? `/${normalizedSegments.join('/')}` : ''
    return `${url.origin}${pathname}`
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

export function normalizeDevProxyConfig(input: unknown): DevProxyConfig | null {
  if (!input || typeof input !== 'object') return null

  const record = input as Record<string, unknown>
  const dynamic = Boolean(record.dynamic)
  const target = normalizeBaseUrl(typeof record.target === 'string' ? record.target : '')
  if (!target && !dynamic) return null

  const rawPrefix = typeof record.prefix === 'string' ? record.prefix : DEFAULT_PROXY_PREFIX
  const trimmedPrefix = rawPrefix.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  const prefix = trimmedPrefix ? `/${trimmedPrefix}` : DEFAULT_PROXY_PREFIX

  return {
    enabled: Boolean(record.enabled),
    prefix,
    target,
    changeOrigin: record.changeOrigin !== false,
    secure: Boolean(record.secure),
    dynamic,
  }
}

export function buildApiUrl(
  baseUrl: string,
  path: string,
  proxyConfig?: DevProxyConfig | null,
  useApiProxy = false,
): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const endpointPath = path.replace(/^\/+/, '')

  if (useApiProxy) {
    return `${proxyConfig?.prefix ?? DEFAULT_PROXY_PREFIX}/${endpointPath}`
  }

  const apiPath = normalizedBaseUrl.endsWith('/v1')
    ? endpointPath
    : ['v1', endpointPath].join('/')

  return normalizedBaseUrl ? `${normalizedBaseUrl}/${apiPath}` : `/${apiPath}`
}

export function createApiProxyHeaders(baseUrl: string, useApiProxy: boolean, options: ApiProxyHeaderOptions = {}): Record<string, string> {
  if (!useApiProxy) return {}
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return {}

  return {
    [API_PROXY_BASE_URL_HEADER]: normalizedBaseUrl,
    ...(options.streamResponse ? { [API_PROXY_TRANSPORT_HEADER]: API_PROXY_TRANSPORT_EVENT_STREAM } : {}),
  }
}

function isApiProxyWrappedResponse(response: Response): boolean {
  return response.headers.get(API_PROXY_TRANSPORT_HEADER) === API_PROXY_TRANSPORT_EVENT_STREAM &&
    (response.headers.get('Content-Type')?.toLowerCase().includes('text/event-stream') ?? false)
}

function parseServerSentEventBlock(block: string): { event: string; data: string } | null {
  let event = 'message'
  const dataLines: string[] = []

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || event
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }

  if (!dataLines.length) return null
  return { event, data: dataLines.join('\n') }
}

function parseEventPayload(data: string): Record<string, unknown> {
  const payload = JSON.parse(data) as unknown
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {}
}

export async function unwrapApiProxyStreamResponse(response: Response): Promise<Response> {
  if (!isApiProxyWrappedResponse(response)) return response
  if (!response.body) throw new Error('API 代理未返回可读取的流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let status = 502
  let statusText = 'Bad Gateway'
  let headers: [string, string][] = [['Content-Type', 'application/json; charset=utf-8']]
  let hasStarted = false
  let hasEnded = false
  const bodyChunks: string[] = []

  const processBlock = (block: string) => {
    const parsed = parseServerSentEventBlock(block)
    if (!parsed) return

    const payload = parseEventPayload(parsed.data)
    if (parsed.event === 'ping') return

    if (parsed.event === 'error') {
      const message = typeof payload.message === 'string' && payload.message.trim()
        ? payload.message
        : 'API 代理请求失败'
      throw new Error(message)
    }

    if (parsed.event === 'response-start') {
      status = typeof payload.status === 'number' ? payload.status : status
      statusText = typeof payload.statusText === 'string' ? payload.statusText : statusText
      headers = Array.isArray(payload.headers)
        ? payload.headers.filter((item): item is [string, string] =>
          Array.isArray(item) &&
          typeof item[0] === 'string' &&
          typeof item[1] === 'string',
        )
        : headers
      hasStarted = true
      return
    }

    if (parsed.event === 'body') {
      const chunk = payload.chunk
      if (typeof chunk === 'string') bodyChunks.push(chunk)
      return
    }

    if (parsed.event === 'response-end') {
      hasEnded = true
      return
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let separatorIndex = buffer.search(/\r?\n\r?\n/)
    while (separatorIndex >= 0) {
      const separator = buffer.match(/\r?\n\r?\n/)?.[0] ?? '\n\n'
      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + separator.length)
      processBlock(block)
      separatorIndex = buffer.search(/\r?\n\r?\n/)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) processBlock(buffer)
  if (!hasStarted || !hasEnded) throw new Error('API 代理响应不完整')

  return new Response(bodyChunks.join(''), {
    status,
    statusText,
    headers: new Headers(headers),
  })
}

export function resolveDevProxyConfig(input: unknown, isDev: boolean): DevProxyConfig | null {
  if (!isDev) return null
  return normalizeDevProxyConfig(input)
}

export function readClientDevProxyConfig(): DevProxyConfig | null {
  return resolveDevProxyConfig(
    typeof __DEV_PROXY_CONFIG__ === 'undefined' ? null : __DEV_PROXY_CONFIG__,
    import.meta.env.DEV,
  )
}

export function isApiProxyAvailable(proxyConfig: DevProxyConfig | null = readClientDevProxyConfig()): boolean {
  return readRuntimeEnv(import.meta.env.VITE_API_PROXY_AVAILABLE) === 'true' || Boolean(proxyConfig?.enabled)
}

export function isApiProxyLocked(proxyConfig: DevProxyConfig | null = readClientDevProxyConfig()): boolean {
  return readRuntimeEnv(import.meta.env.VITE_API_PROXY_LOCKED) === 'true' && isApiProxyAvailable(proxyConfig)
}

export function isApiProxyDynamic(proxyConfig: DevProxyConfig | null = readClientDevProxyConfig()): boolean {
  return readRuntimeEnv(import.meta.env.VITE_API_PROXY_DYNAMIC) === 'true' || Boolean(proxyConfig?.dynamic)
}

export function shouldUseApiProxy(apiProxy: boolean, proxyConfig: DevProxyConfig | null = readClientDevProxyConfig()): boolean {
  return isApiProxyAvailable(proxyConfig) && (apiProxy || isApiProxyLocked(proxyConfig))
}
