export type AskRequest = {
  question: string
}

export type AskResponse = {
  question: string
  sparql: string | null
  results: unknown
  answer: string
  phases: string[]
  steps: number
}

export type BaselineResponse = {
  question: string
  answer: string
  steps: number
}

export type GraphRAGResponse = {
  question: string
  answer: string
  results: unknown
  steps: number
}

export type HealthResponse = {
  status: string
  ontology_paths: string[]
  ontology_ready: boolean
  fuseki_query_endpoint: string
  graphrag_api_base_url: string
  openai_model: string
}

export type ErrorResponse = {
  detail: string
}
