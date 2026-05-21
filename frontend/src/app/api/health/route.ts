import type { HealthResponse } from '@/types/ontology'
import { proxyBackendGet } from '@/lib/api'

export async function GET() {
  return proxyBackendGet<HealthResponse>('/health')
}
