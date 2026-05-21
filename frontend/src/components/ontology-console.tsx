"use client";

import { startTransition, useEffect, useEffectEvent, useState } from "react";
import type { FormEvent } from "react";

import { formatJson, toErrorMessage } from "@/lib/format";
import type {
  AskResponse,
  ErrorResponse,
  HealthResponse,
} from "@/types/ontology";

type LoadState = "idle" | "loading" | "success" | "error";

type StreamEvent =
  | { type: "answer_delta"; delta: string; step: number }
  | { type: "final"; payload: AskResponse }
  | { type: "phase"; phase: string; step: number }
  | { type: "error"; detail: string };

const EXAMPLE_QUESTIONS = [
  "¿Qué fármacos tienen como indicación osteoporosis?",
  "¿Qué dianas están asociadas al fármaco ABALOPARATIDE?",
  "¿Qué mecanismos de acción aparecen para ABARELIX?",
];

const PHASE_LABELS: Record<string, string> = {
  planning: "Planificación",
  schema_discovery: "Exploración del esquema",
  execution: "Ejecución",
  reporting: "Síntesis",
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return JSON.parse(text) as T;
}

function emptyResult(question: string): AskResponse {
  return {
    question,
    sparql: null,
    results: null,
    answer: "",
    phases: [],
    steps: 0,
  };
}

function parseSseFrame(frame: string): StreamEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data) {
    return null;
  }

  return JSON.parse(data) as StreamEvent;
}

function getRequestLabel(loadState: LoadState) {
  if (loadState === "idle") {
    return "Preparado";
  }

  if (loadState === "loading") {
    return "Consultando";
  }

  if (loadState === "success") {
    return "Completado";
  }

  return "Revisar";
}

export function OntologyConsole() {
  const [question, setQuestion] = useState(
    "¿Qué fármacos tienen como indicación osteoporosis?",
  );
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const backendReady = health?.status === "ok" && health?.ontology_ready;

  const loadHealth = useEffectEvent(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = await readJson<HealthResponse | ErrorResponse>(response);

      if (!response.ok) {
        const detail =
          "detail" in payload ? payload.detail : "Health check failed";
        setHealthError(detail);
        return;
      }

      setHealth(payload as HealthResponse);
      setHealthError(null);
    } catch (error) {
      setHealthError(toErrorMessage(error));
    }
  });

  useEffect(() => {
    void loadHealth();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setSubmitError("Escribe una pregunta antes de consultar.");
      setLoadState("error");
      return;
    }

    setLoadState("loading");
    setSubmitError(null);
    setResult(emptyResult(trimmedQuestion));

    try {
      const response = await fetch("/api/ask/stream", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ question: trimmedQuestion }),
      });

      if (!response.ok || !response.body) {
        const payload = await readJson<ErrorResponse>(response);
        const detail =
          "detail" in payload ? payload.detail : "Backend request failed";
        setSubmitError(detail);
        setLoadState("error");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedFinal = false;
      let streamFailed = false;

      const handleStreamEvent = (event: StreamEvent) => {
        if (event.type === "answer_delta") {
          setResult((current) => ({
            ...(current ?? emptyResult(trimmedQuestion)),
            answer: `${current?.answer ?? ""}${event.delta}`,
            steps: event.step,
          }));
          return;
        }

        if (event.type === "phase") {
          setResult((current) => {
            const result = current ?? emptyResult(trimmedQuestion);
            const phases = result.phases.includes(event.phase)
              ? result.phases
              : [...result.phases, event.phase];

            return { ...result, phases, steps: event.step };
          });
          return;
        }

        if (event.type === "error") {
          streamFailed = true;
          setSubmitError(event.detail);
          setLoadState("error");
          return;
        }

        receivedFinal = true;
        startTransition(() => {
          setResult(event.payload);
          setLoadState("success");
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const event = parseSseFrame(frame);
          if (event) {
            handleStreamEvent(event);
          }
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        const event = parseSseFrame(buffer);
        if (event) {
          handleStreamEvent(event);
        }
      }

      if (!receivedFinal && !streamFailed) {
        setSubmitError("La conexión terminó antes de recibir la respuesta final.");
        setLoadState("error");
      }
    } catch (error) {
      setSubmitError(toErrorMessage(error));
      setLoadState("error");
    }
  }

  return (
    <main className="page-shell">
      <header className="global-nav">
        <div className="content-frame global-nav-inner">
          <p className="brand-mark">Ontology Agent</p>
          <div className="nav-meta" aria-label="Estado general">
            <span className="nav-copy">Consulta semántica sobre RDF y OWL</span>
            <span className={`status-pill ${backendReady ? "status-ok" : "status-warning"}`}>
              {backendReady ? "Backend listo" : "Comprobando backend"}
            </span>
          </div>
        </div>
      </header>

      <section className="hero-tile tile-light">
        <div className="content-frame hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Ontology Agent</p>
            <h1>Consulta la ontología en lenguaje natural.</h1>
            <p className="lede">
              Formula una pregunta, deja que el agente construya la SPARQL y
              revisa tanto la respuesta redactada como la traza técnica.
            </p>
            <div className="hero-actions">
              <a className="button-primary" href="#query-console">
                Consultar
              </a>
              <a className="button-secondary" href="#traceability">
                Ver trazabilidad
              </a>
            </div>
          </div>

          <aside className="hero-status" aria-label="Estado del backend">
            <div className="utility-card">
              <p className="panel-label">Disponibilidad</p>
              <h2>{backendReady ? "Sistema preparado" : "Esperando servicios"}</h2>
              <p className="utility-copy">
                {backendReady
                  ? "El backend, Fuseki y la ontología están listos para resolver consultas."
                  : "La consola sigue comprobando la API, el endpoint SPARQL y la carga de la ontología."}
              </p>
            </div>
            <dl className="status-grid">
              <div className="status-card">
                <dt>Modelo</dt>
                <dd>{health?.openai_model ?? "Unknown"}</dd>
              </div>
              <div className="status-card">
                <dt>Fuseki</dt>
                <dd>{health?.fuseki_query_endpoint ?? "Unavailable"}</dd>
              </div>
              <div className="status-card">
                <dt>Ontología</dt>
                <dd>{health?.ontology_ready ? "Cargada" : "Pendiente"}</dd>
              </div>
            </dl>
            {healthError ? <p className="inline-error">{healthError}</p> : null}
          </aside>
        </div>
      </section>

      <section className="query-tile tile-parchment" id="query-console">
        <div className="content-frame query-layout">
          <div className="query-intro">
            <p className="panel-label">Consulta</p>
            <h2>Formula la pregunta con el mismo detalle con el que la harías a un analista.</h2>
            <p className="section-copy">
              El agente inspecciona el esquema, construye una consulta de solo
              lectura y sintetiza la salida. Puedes partir de una de estas
              preguntas y afinarla.
            </p>
            <div className="examples" aria-label="Preguntas de ejemplo">
              {EXAMPLE_QUESTIONS.map((example) => (
                <button
                  className="example-button"
                  key={example}
                  type="button"
                  onClick={() => setQuestion(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="query-card">
            <div className="panel-header">
              <div>
                <p className="panel-label">Entrada</p>
                <h3>Pregunta para la ontología</h3>
              </div>
              <span className={`request-state request-${loadState}`}>
                {getRequestLabel(loadState)}
              </span>
            </div>

            <form className="query-form" onSubmit={handleSubmit}>
              <label className="field-label" htmlFor="question">
                Pregunta para la ontología
              </label>
              <p className="field-copy">
                Describe la relación, entidad o indicación que quieres comprobar.
              </p>
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
                  disabled={loadState === "loading"}
                >
                  {loadState === "loading" ? "Consultando..." : "Consultar"}
                </button>
                <p className="helper-copy">
                  El flujo combina descubrimiento del esquema, ejecución SPARQL
                  y redacción final sobre los resultados.
                </p>
              </div>
            </form>

            {submitError ? (
              <div className="message error-box" role="alert">
                {submitError}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="results-band">
        <div className="content-frame results-grid">
          <article className="result-tile tile-dark">
            {result ? (
              <>
                <div className="answer-header">
                  <div>
                    <p className="panel-label panel-label-dark">Respuesta</p>
                    <h2>{result.question}</h2>
                  </div>
                  <p className="steps-pill">{result.steps} pasos</p>
                </div>
                <p className="answer-text">
                  {result.answer ||
                    "Esperando los primeros fragmentos de respuesta."}
                </p>
                <div className="phase-list" aria-label="Execution phases">
                  {result.phases.map((phase) => (
                    <span className="phase-chip" key={phase}>
                      {PHASE_LABELS[phase] ?? phase}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p className="panel-label panel-label-dark">Listo</p>
                <h2>Sin respuesta todavía</h2>
                <p>
                  Envía una pregunta para ver la síntesis textual, la consulta
                  generada y la respuesta estructurada del agente.
                </p>
              </div>
            )}
          </article>

          <aside className="trace-panel" id="traceability">
            <div className="trace-header">
              <p className="panel-label">Trazabilidad</p>
              <h2>SPARQL y artefactos técnicos</h2>
              <p className="section-copy">
                El detalle operativo se mantiene separado para que la lectura de
                la respuesta siga siendo limpia, pero la validación técnica esté
                siempre visible.
              </p>
            </div>

            <div className="debug-block utility-card">
              <h3>SPARQL</h3>
              <pre className="code-block">
                {result?.sparql ?? "Aún no hay consulta."}
              </pre>
            </div>

            <div className="debug-block utility-card">
              <h3>Resultados crudos</h3>
              <pre className="code-block">
                {result ? formatJson(result.results) : "Aún no hay resultados."}
              </pre>
            </div>

            <div className="debug-block utility-card">
              <h3>Rutas de ontología</h3>
              <pre className="code-block">
                {health
                  ? formatJson(health.ontology_paths)
                  : "Esperando comprobación de salud."}
              </pre>
            </div>
          </aside>
        </div>
      </section>

      <footer className="footer-band">
        <div className="content-frame footer-inner">
          <p>
            Consola de trabajo para explorar una ontología biomédica con
            consultas reproducibles y salida verificable.
          </p>
          <p>Frontend alineado con una gramática visual editorial y discreta.</p>
        </div>
      </footer>
    </main>
  );
}
