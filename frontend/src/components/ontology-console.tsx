'use client'

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
} from 'react'
import type { FormEvent } from 'react'

import { formatJson, toErrorMessage } from '@/lib/format'
import type {
  AskResponse,
  ErrorResponse,
  HealthResponse,
} from '@/types/ontology'

type LoadState = 'idle' | 'loading' | 'success' | 'error'

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  return JSON.parse(text) as T
}

export function OntologyConsole() {
  const [question, setQuestion] = useState(
    '¿Qué fármacos tienen como indicación osteoporosis?',
  )
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [result, setResult] = useState<AskResponse | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const loadHealth = useEffectEvent(async () => {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' })
      const payload = await readJson<HealthResponse | ErrorResponse>(response)

      if (!response.ok) {
        const detail =
          'detail' in payload ? payload.detail : 'Health check failed'
        setHealthError(detail)
        return
      }

      setHealth(payload as HealthResponse)
      setHealthError(null)
    } catch (error) {
      setHealthError(toErrorMessage(error))
    }
  })

  useEffect(() => {
    void loadHealth()
  }, [loadHealth])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) {
      setSubmitError('Write a question before submitting.')
      setLoadState('error')
      return
    }

    setLoadState('loading')
    setSubmitError(null)

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ question: trimmedQuestion }),
      })
      const payload = await readJson<AskResponse | ErrorResponse>(response)

      if (!response.ok) {
        const detail =
          'detail' in payload ? payload.detail : 'Backend request failed'
        setSubmitError(detail)
        setLoadState('error')
        return
      }

      startTransition(() => {
        setResult(payload as AskResponse)
        setLoadState('success')
      })
    } catch (error) {
      setSubmitError(toErrorMessage(error))
      setLoadState('error')
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Ontology Agent</p>
          <h1>Consulta la ontología y revisa la SPARQL generada</h1>
          <p className="lede">
            Frontend de inspección para preguntas en lenguaje natural sobre el
            dataset RDF cargado en Fuseki.
          </p>
        </div>
        <div className="status-card">
          <span
            className={`status-pill ${
              health?.status === 'ok' && health?.ontology_ready
                ? 'status-ok'
                : 'status-warning'
            }`}
          >
            {health?.status === 'ok' && health?.ontology_ready
              ? 'Backend ready'
              : 'Backend check'}
          </span>
          <dl className="status-grid">
            <div>
              <dt>Model</dt>
              <dd>{health?.openai_model ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Fuseki</dt>
              <dd>{health?.fuseki_query_endpoint ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Ontology</dt>
              <dd>{health?.ontology_ready ? 'Loaded' : 'Pending'}</dd>
            </div>
          </dl>
          {healthError ? <p className="inline-error">{healthError}</p> : null}
        </div>
      </section>

      <section className="workspace">
        <div className="panel query-panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Pregunta</p>
              <h2>Consulta en lenguaje natural</h2>
            </div>
            <span className={`request-state request-${loadState}`}>
              {loadState}
            </span>
          </div>
          <form className="query-form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="question">
              What do you want to ask the ontology?
            </label>
            <textarea
              id="question"
              className="question-input"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={6}
              placeholder="¿Qué dianas están asociadas al fármaco ABALOPARATIDE?"
            />
            <div className="actions">
              <button
                className="submit-button"
                type="submit"
                disabled={loadState === 'loading'}
              >
                {loadState === 'loading' ? 'Consulting ontology...' : 'Ask'}
              </button>
              <p className="helper-copy">
                El frontend llama a Next.js y Next reenvía la petición a
                FastAPI.
              </p>
            </div>
          </form>

          {submitError ? (
            <div className="message error-box" role="alert">
              {submitError}
            </div>
          ) : null}

          {result ? (
            <article className="answer-card">
              <div className="answer-header">
                <p className="panel-label">Respuesta</p>
                <p className="steps-pill">{result.steps} steps</p>
              </div>
              <p className="answer-text">{result.answer}</p>
              <div className="phase-list" aria-label="Execution phases">
                {result.phases.map((phase) => (
                  <span className="phase-chip" key={phase}>
                    {phase}
                  </span>
                ))}
              </div>
            </article>
          ) : (
            <div className="empty-state">
              <p className="panel-label">Ready</p>
              <h3>Sin respuesta todavía</h3>
              <p>
                Envía una pregunta para ver la salida textual y los artefactos
                técnicos del agente.
              </p>
            </div>
          )}
        </div>

        <aside className="panel debug-panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">Debug</p>
              <h2>SPARQL y resultados</h2>
            </div>
          </div>

          <div className="debug-block">
            <h3>SPARQL</h3>
            <pre className="code-block">{result?.sparql ?? 'No query yet.'}</pre>
          </div>

          <div className="debug-block">
            <h3>Raw results</h3>
            <pre className="code-block">
              {result ? formatJson(result.results) : 'No results yet.'}
            </pre>
          </div>

          <div className="debug-block">
            <h3>Ontology paths</h3>
            <pre className="code-block">
              {health ? formatJson(health.ontology_paths) : 'Waiting for health check.'}
            </pre>
          </div>
        </aside>
      </section>
    </main>
  )
}
