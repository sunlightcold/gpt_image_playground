import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { Readable } from 'stream'
import { API_PROXY_BASE_URL_HEADER, API_PROXY_TRANSPORT_HEADER, type DevProxyConfig, normalizeBaseUrl, normalizeDevProxyConfig } from './src/lib/devProxy'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const DEFAULT_DYNAMIC_DEV_PROXY_CONFIG: DevProxyConfig = {
  enabled: true,
  prefix: '/api-proxy',
  target: '',
  changeOrigin: true,
  secure: false,
  dynamic: true,
}

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

function loadDevProxyConfig() {
  try {
    return normalizeDevProxyConfig(
      JSON.parse(readFileSync('./dev-proxy.config.json', 'utf-8')) as unknown,
    )
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return DEFAULT_DYNAMIC_DEV_PROXY_CONFIG
    throw error
  }
}

function isProxyPath(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function joinPath(basePath: string, endpointPath: string): string {
  const left = basePath.replace(/\/+$/, '')
  const right = endpointPath.replace(/^\/+/, '')
  return `/${[left.replace(/^\/+/, ''), right].filter(Boolean).join('/')}`
}

function createDynamicProxyTarget(reqUrl: string, prefix: string, baseUrlValue: string) {
  const localUrl = new URL(reqUrl, 'http://localhost')
  const endpointPath = localUrl.pathname.slice(prefix.length).replace(/^\/+/, '')
  if (!endpointPath) throw new Error('缺少 API 代理路径')

  const target = new URL(normalizeBaseUrl(baseUrlValue))
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('动态代理目标仅支持 http/https URL')
  }
  target.pathname = joinPath(target.pathname, endpointPath)
  target.search = localUrl.search
  return target.toString()
}

function createDynamicProxyHeaders(headers: Record<string, string | string[] | undefined>) {
  const next = new Headers()
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()
    if (!value || HOP_BY_HOP_HEADERS.has(lowerKey)) continue
    if ([API_PROXY_BASE_URL_HEADER, API_PROXY_TRANSPORT_HEADER, 'host', 'origin', 'referer', 'content-length'].includes(lowerKey)) continue
    if (Array.isArray(value)) {
      for (const item of value) next.append(key, item)
    } else {
      next.set(key, value)
    }
  }
  return next
}

function writeJsonError(res: import('http').ServerResponse, statusCode: number, message: string) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: { message } }))
}

function dynamicApiProxyPlugin(proxyConfig: DevProxyConfig | null) {
  return {
    name: 'dynamic-api-proxy',
    configureServer(server: import('vite').ViteDevServer) {
      if (!proxyConfig?.enabled || !proxyConfig.dynamic) return
      server.middlewares.use(async (req, res, next) => {
        try {
          const reqUrl = req.url ?? ''
          const pathname = new URL(reqUrl, 'http://localhost').pathname
          if (!isProxyPath(pathname, proxyConfig.prefix)) return next()

          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }

          const baseUrl = req.headers[API_PROXY_BASE_URL_HEADER]
          const baseUrlValue = Array.isArray(baseUrl) ? baseUrl[0] : baseUrl
          if (!baseUrlValue) {
            writeJsonError(res, 400, `缺少 ${API_PROXY_BASE_URL_HEADER} 请求头`)
            return
          }

          const targetUrl = createDynamicProxyTarget(reqUrl, proxyConfig.prefix, baseUrlValue)
          const upstream = await fetch(targetUrl, {
            method: req.method,
            headers: createDynamicProxyHeaders(req.headers),
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
            redirect: 'follow',
            duplex: 'half',
          } as RequestInit & { duplex: 'half' })

          res.statusCode = upstream.status
          res.statusMessage = upstream.statusText
          upstream.headers.forEach((value, key) => {
            if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) res.setHeader(key, value)
          })
          if (!upstream.body) {
            res.end()
            return
          }
          Readable.fromWeb(upstream.body).pipe(res)
        } catch (error) {
          writeJsonError(res, 502, error instanceof Error ? error.message : '动态代理请求失败')
        }
      })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const devProxyConfig = command === 'serve' && mode !== 'test' ? loadDevProxyConfig() : null

  return {
    plugins: [react(), dynamicApiProxyPlugin(devProxyConfig)],
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __DEV_PROXY_CONFIG__: JSON.stringify(devProxyConfig),
    },
    server: {
      host: true,
      proxy:
        devProxyConfig?.enabled && !devProxyConfig.dynamic
          ? {
              [devProxyConfig.prefix]: {
                target: devProxyConfig.target,
                changeOrigin: devProxyConfig.changeOrigin,
                secure: devProxyConfig.secure,
                rewrite: (path) =>
                  path.replace(
                    new RegExp(`^${devProxyConfig.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
                    '',
                  ),
              },
            }
          : undefined,
    },
  }
})
