import { describe, expect, it } from 'vitest'
import { API_PROXY_BASE_URL_HEADER, API_PROXY_TRANSPORT_EVENT_STREAM, API_PROXY_TRANSPORT_HEADER, buildApiUrl, createApiProxyHeaders, unwrapApiProxyStreamResponse } from './devProxy'

describe('buildApiUrl', () => {
  it('uses the same-origin proxy prefix when API proxy is enabled', () => {
    expect(buildApiUrl('http://api.example.com/v1', 'images/edits', null, true)).toBe(
      '/api-proxy/images/edits',
    )
  })

  it('leaves API versioning to the proxy target when proxying', () => {
    expect(buildApiUrl('http://api.example.com', 'images/generations', null, true)).toBe(
      '/api-proxy/images/generations',
    )
  })

  it('uses a configured proxy prefix when one is available', () => {
    expect(
      buildApiUrl(
        'http://api.example.com/v1',
        'responses',
        {
          enabled: true,
          prefix: '/openai-proxy',
          target: 'http://api.example.com/v1',
          changeOrigin: true,
          secure: false,
        },
        true,
      ),
    ).toBe('/openai-proxy/responses')
  })

  it('uses the configured API URL directly when API proxy is disabled', () => {
    expect(buildApiUrl('http://api.example.com/v1', 'responses', null, false)).toBe(
      'http://api.example.com/v1/responses',
    )
  })

  it('passes the normalized dynamic proxy target in a request header', () => {
    expect(createApiProxyHeaders('api.example.com', true)).toEqual({
      [API_PROXY_BASE_URL_HEADER]: 'https://api.example.com',
    })
  })

  it('can request a stream-wrapped proxy response', () => {
    expect(createApiProxyHeaders('api.example.com', true, { streamResponse: true })).toEqual({
      [API_PROXY_BASE_URL_HEADER]: 'https://api.example.com',
      [API_PROXY_TRANSPORT_HEADER]: API_PROXY_TRANSPORT_EVENT_STREAM,
    })
  })

  it('omits the dynamic proxy target header when proxying is disabled or the base URL is empty', () => {
    expect(createApiProxyHeaders('https://api.example.com/v1', false)).toEqual({})
    expect(createApiProxyHeaders('', true)).toEqual({})
  })

  it('unwraps stream-wrapped proxy responses back to normal responses', async () => {
    const wrapped = new Response([
      'event: ping',
      'data: {"ts":1}',
      '',
      'event: response-start',
      'data: {"status":201,"statusText":"Created","headers":[["Content-Type","application/json"]]}',
      '',
      'event: body',
      'data: {"chunk":"{\\"ok\\":"}',
      '',
      'event: body',
      'data: {"chunk":"true}"}',
      '',
      'event: response-end',
      'data: {}',
      '',
    ].join('\n'), {
      headers: {
        'Content-Type': 'text/event-stream',
        [API_PROXY_TRANSPORT_HEADER]: API_PROXY_TRANSPORT_EVENT_STREAM,
      },
    })

    const response = await unwrapApiProxyStreamResponse(wrapped)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true })
  })
})
