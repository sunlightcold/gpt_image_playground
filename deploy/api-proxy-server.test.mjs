import { once } from 'node:events'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { strict as assert } from 'node:assert'

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

async function closeServer(server) {
  if (!server.listening) return
  server.close()
  await once(server, 'close')
}

async function main() {
  const upstream = http.createServer((request, response) => {
    if (request.url?.startsWith('/cases.json')) {
      response.writeHead(200, { 'Content-Type': 'application/json', ETag: '"cases-test"' })
      response.end(JSON.stringify({ source: { commit: 'test' }, cases: [{ id: 1 }] }))
      return
    }

    if (request.url !== '/v1/images/generations') {
      response.writeHead(404)
      response.end()
      return
    }

    setTimeout(() => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ data: [{ b64_json: 'ok' }] }))
    }, 250)
  })
  const upstreamPort = await listen(upstream)

  const proxyServer = http.createServer()
  const proxyPort = await listen(proxyServer)
  await closeServer(proxyServer)

  const child = spawn(process.execPath, ['deploy/api-proxy-server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_PROXY_SERVER_PORT: String(proxyPort),
      API_PROXY_HEARTBEAT_MS: '50',
      API_PROXY_URL: `http://127.0.0.1:${upstreamPort}/v1`,
      LOCK_API_PROXY: 'true',
      PROMPT_CASE_DATASET_URL: `http://127.0.0.1:${upstreamPort}/cases.json`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('proxy server did not start')), 5000)
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('api proxy server listening')) {
          clearTimeout(timeout)
          resolve()
        }
      })
      child.on('exit', (code) => reject(new Error(`proxy server exited with ${code}`)))
    })

    const response = await fetch(`http://127.0.0.1:${proxyPort}/api-proxy/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test',
        'Content-Type': 'application/json',
        'x-api-proxy-transport': 'event-stream',
      },
      body: JSON.stringify({ prompt: 'test' }),
    })

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-api-proxy-transport'), 'event-stream')

    const body = await response.text()
    assert.match(body, /event: ping/)
    assert.match(body, /event: response-start/)
    assert.match(body, /event: body/)
    assert.match(body, /event: response-end/)
    assert.match(body, /\\"b64_json\\":\\"ok\\"/)

    const casesResponse = await fetch(`http://127.0.0.1:${proxyPort}/prompt-cases`)
    assert.equal(casesResponse.status, 200)
    assert.equal(casesResponse.headers.get('content-type'), 'application/json; charset=utf-8')
    assert.equal(casesResponse.headers.get('x-prompt-cases-source'), 'remote')
    assert.deepEqual(await casesResponse.json(), {
      source: { commit: 'test' },
      cases: [{ id: 1 }],
    })
  } finally {
    child.kill('SIGTERM')
    await closeServer(upstream)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
