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
  const llmProvider =
    typeof payload === 'object' && payload !== null && 'llm_provider' in payload
      ? payload.llm_provider
      : undefined

  if (typeof question !== 'string' || !question.trim()) {
    return NextResponse.json(
      { detail: 'The question field must be a non-empty string' },
      { status: 400 },
    )
  }

  if (
    llmProvider !== undefined &&
    llmProvider !== 'openai' &&
    llmProvider !== 'huggingface'
  ) {
    return NextResponse.json(
      { detail: 'The llm_provider field must be openai or huggingface' },
      { status: 400 },
    )
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/baseline/stream`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        question: question.trim(),
        ...(llmProvider ? { llm_provider: llmProvider } : {}),
      }),
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
