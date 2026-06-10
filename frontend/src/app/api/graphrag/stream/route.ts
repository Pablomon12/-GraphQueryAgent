import { NextRequest, NextResponse } from 'next/server'

import { getApiBaseUrl } from '@/lib/api'

export async function POST(request: NextRequest) {
  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON body' }, { status: 400 })
  }

  const question =
    typeof payload === 'object' && payload !== null && 'question' in payload
      ? payload.question
      : null

  if (typeof question !== 'string' || !question.trim()) {
    return NextResponse.json(
      { detail: 'The question field must be a non-empty string' },
      { status: 400 },
    )
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/graphrag/stream`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ question: question.trim() }),
    })

    if (!response.body) {
      return NextResponse.json(
        { detail: 'Empty stream from backend' },
        { status: 502 },
      )
    }

    return new Response(response.body, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : 'Backend request failed',
      },
      { status: 502 },
    )
  }
}
