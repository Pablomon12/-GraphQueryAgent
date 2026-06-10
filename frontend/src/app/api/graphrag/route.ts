import { NextRequest, NextResponse } from 'next/server'

import { proxyBackendPost } from '@/lib/api'
import type { GraphRAGResponse } from '@/types/ontology'

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

  return proxyBackendPost<GraphRAGResponse>('/graphrag', {
    question: question.trim(),
  })
}
