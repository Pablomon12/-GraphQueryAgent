import { NextRequest, NextResponse } from 'next/server'

import { proxyBackendPost } from '@/lib/api'
import type { BaselineResponse } from '@/types/ontology'

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

  return proxyBackendPost<BaselineResponse>('/baseline', {
    question: question.trim(),
    ...(llmProvider ? { llm_provider: llmProvider } : {}),
  })
}
