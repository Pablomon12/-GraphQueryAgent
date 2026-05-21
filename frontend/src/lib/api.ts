import { NextResponse } from 'next/server'

import type { ErrorResponse } from '@/types/ontology'

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function getApiBaseUrl(): string {
  const value = process.env.ONTOLOGY_API_BASE_URL?.trim()

  if (!value) {
    throw new Error('ONTOLOGY_API_BASE_URL is not configured')
  }

  return trimTrailingSlash(value)
}

export async function parseBackendJson<T>(
  response: Response,
): Promise<T | ErrorResponse> {
  const text = await response.text()

  if (!text) {
    return { detail: 'Empty response from backend' }
  }

  try {
    return JSON.parse(text) as T
  } catch {
    return { detail: text }
  }
}

export async function proxyBackendGet<T>(path: string): Promise<NextResponse<T | ErrorResponse>> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
      },
    })
    const payload = await parseBackendJson<T>(response)

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : 'Backend request failed',
      },
      { status: 502 },
    )
  }
}

export async function proxyBackendPost<T>(
  path: string,
  body: unknown,
): Promise<NextResponse<T | ErrorResponse>> {
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
    const payload = await parseBackendJson<T>(response)

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : 'Backend request failed',
      },
      { status: 502 },
    )
  }
}
