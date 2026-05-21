import { getApiBaseUrl, parseBackendJson } from '@/lib/api'

describe('getApiBaseUrl', () => {
  const originalValue = process.env.ONTOLOGY_API_BASE_URL

  afterEach(() => {
    process.env.ONTOLOGY_API_BASE_URL = originalValue
  })

  it('trims trailing slash', () => {
    process.env.ONTOLOGY_API_BASE_URL = 'http://127.0.0.1:8000/'

    expect(getApiBaseUrl()).toBe('http://127.0.0.1:8000')
  })

  it('throws when env var is missing', () => {
    delete process.env.ONTOLOGY_API_BASE_URL

    expect(() => getApiBaseUrl()).toThrow(
      'ONTOLOGY_API_BASE_URL is not configured',
    )
  })
})

describe('parseBackendJson', () => {
  it('parses valid json payloads', async () => {
    const response = new Response(JSON.stringify({ status: 'ok' }))

    await expect(parseBackendJson<{ status: string }>(response)).resolves.toEqual(
      { status: 'ok' },
    )
  })

  it('falls back to detail message on invalid json', async () => {
    const response = new Response('plain text backend error')

    await expect(parseBackendJson(response)).resolves.toEqual({
      detail: 'plain text backend error',
    })
  })
})
