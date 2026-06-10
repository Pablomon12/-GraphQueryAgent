"use client";

import { startTransition, useEffect, useEffectEvent, useState } from "react";
import type { FormEvent } from "react";

import { formatJson, toErrorMessage } from "@/lib/format";
import type {
  AskResponse,
  BaselineResponse,
  ErrorResponse,
  GraphRAGResponse,
  HealthResponse,
} from "@/types/ontology";

type LoadState = "idle" | "loading" | "success" | "error";

type StreamEvent =
  | { type: "answer_delta"; delta: string; step: number }
  | { type: "final"; payload: AskResponse }
  | { type: "phase"; phase: string; step: number }
  | { type: "error"; detail: string };

type BaselineStreamEvent =
  | { type: "answer_delta"; delta: string; step: number }
  | { type: "final"; payload: BaselineResponse }
  | { type: "error"; detail: string };

type GraphRAGStreamEvent =
  | { type: "answer_delta"; delta: string; step: number }
  | { type: "final"; payload: GraphRAGResponse }
  | { type: "error"; detail: string };

type ExperimentQuestion = {
  id: string;
  question: string;
  expected: string;
  expectedData:
    | { kind: "categories"; values: Record<string, number> }
    | { kind: "count"; count: number }
    | { kind: "fields"; fields: string[] }
    | { kind: "entities"; entities: string[] };
  metric: string;
};

type EvaluationMetrics = {
  exactAccuracy: number;
  precision: number;
  recall: number;
  f1: number;
  completeness: number;
  hallucinations: number;
  traceability: number;
  latencyMs: number;
  steps: number;
};

type ExperimentRun = {
  state: LoadState;
  semanticAgent?: AskResponse;
  baseModel?: BaselineResponse;
  graphRag?: GraphRAGResponse;
  semanticMetrics?: EvaluationMetrics;
  baseMetrics?: EvaluationMetrics;
  graphRagMetrics?: EvaluationMetrics;
  error?: string;
};

type SystemComparison = {
  id: string;
  label: string;
  summary: string;
  chips: string[];
};

const EXAMPLE_QUESTIONS = [
  "¿Qué fármacos tienen como indicación osteoporosis?",
  "¿Qué dianas están asociadas al fármaco ABALOPARATIDE?",
  "¿Qué mecanismos de acción aparecen para ABARELIX?",
];

const EXPERIMENT_QUESTIONS: ExperimentQuestion[] = [
  {
    id: "drug_type_distribution",
    question: "¿Cuántos fármacos hay por cada tipo de fármaco?",
    expected:
      "Small molecule 1440; Protein 162; Antibody 106; Unknown 21; Oligonucleotide 19; Antibody drug conjugate 13; Gene 10; Enzyme 7; Oligosaccharide 6; Cell 2.",
    expectedData: {
      kind: "categories",
      values: {
        "Small molecule": 1440,
        Protein: 162,
        Antibody: 106,
        Unknown: 21,
        Oligonucleotide: 19,
        "Antibody drug conjugate": 13,
        Gene: 10,
        Enzyme: 7,
        Oligosaccharide: 6,
        Cell: 2,
      },
    },
    metric: "Exactitud por categoría",
  },
  {
    id: "diabetes_mellitus_count",
    question: "¿Cuántos fármacos están indicados para diabetes mellitus?",
    expected: "63 fármacos distintos.",
    expectedData: { kind: "count", count: 63 },
    metric: "Exactitud numérica",
  },
  {
    id: "abarelix_mechanism_target",
    question: "¿Qué mecanismo de acción y qué diana tiene ABARELIX?",
    expected:
      "Mecanismo: Gonadotropin-releasing hormone receptor antagonist. Diana/símbolo: GNRHR.",
    expectedData: {
      kind: "fields",
      fields: ["Gonadotropin-releasing hormone receptor antagonist", "GNRHR"],
    },
    metric: "Completitud y coincidencia exacta",
  },
  {
    id: "egfr_target_drugs",
    question: "¿Qué fármacos tienen como target aprobado EGFR?",
    expected:
      "17 fármacos: AFATINIB DIMALEATE, AMIVANTAMAB, BRIGATINIB, CETUXIMAB, DACOMITINIB, ERLOTINIB HYDROCHLORIDE, GEFITINIB, LAPATINIB DITOSYLATE, MOBOCERTINIB, MOBOCERTINIB SUCCINATE, NECITUMUMAB, NERATINIB MALEATE, OLMUTINIB, OSIMERTINIB, OSIMERTINIB MESYLATE, PANITUMUMAB, VANDETANIB.",
    expectedData: {
      kind: "entities",
      entities: [
        "AFATINIB DIMALEATE",
        "AMIVANTAMAB",
        "BRIGATINIB",
        "CETUXIMAB",
        "DACOMITINIB",
        "ERLOTINIB HYDROCHLORIDE",
        "GEFITINIB",
        "LAPATINIB DITOSYLATE",
        "MOBOCERTINIB",
        "MOBOCERTINIB SUCCINATE",
        "NECITUMUMAB",
        "NERATINIB MALEATE",
        "OLMUTINIB",
        "OSIMERTINIB",
        "OSIMERTINIB MESYLATE",
        "PANITUMUMAB",
        "VANDETANIB",
      ],
    },
    metric: "Precision, recall y F1 de entidades",
  },
];

const EXPERIMENT_STATS = [
  { label: "Preguntas", value: "4" },
  { label: "Sistemas", value: "3" },
  { label: "Repeticiones", value: "3" },
  { label: "Ejecuciones", value: "36" },
];

const SYSTEM_COMPARISON: SystemComparison[] = [
  {
    id: "semantic_agent",
    label: "Agente semántico",
    summary:
      "Explora la ontología, genera SPARQL, ejecuta la consulta y conserva resultados verificables.",
    chips: ["Con herramientas", "SPARQL", "Resultados estructurados", "Trazabilidad completa"],
  },
  {
    id: "base_model",
    label: "Modelo base",
    summary:
      "Responde solo desde conocimiento paramétrico, sin acceso al grafo ni a las herramientas.",
    chips: ["Sin herramientas", "Sin grafo", "Sin SPARQL", "Trazabilidad 0"],
  },
  {
    id: "graph_rag",
    label: "GraphRAG",
    summary:
      "Consulta una API GraphRAG externa sobre Neo4j y devuelve respuesta con evidencia recuperada.",
    chips: ["Neo4j", "Vector search", "Evidencia", "Servicio externo"],
  },
];

const MANUAL_QUERY_RUN_ID = "manual_query";

const PHASE_LABELS: Record<string, string> = {
  llm_call: "Llamada al modelo",
  "tool:read_semantic_catalog": "Catálogo semántico",
  "tool:run_sparql": "SPARQL",
  planning: "Planificación",
  schema_discovery: "Exploración del esquema",
  execution: "Ejecución",
  reporting: "Síntesis",
};

function mergePhases(...phaseGroups: string[][]): string[] {
  return phaseGroups.flat().filter((phase, index, phases) => phases.indexOf(phase) === index);
}

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

function emptyGraphRagResult(question: string): GraphRAGResponse {
  return {
    question,
    answer: "",
    results: null,
    steps: 0,
  };
}

function emptyBaselineResult(question: string): BaselineResponse {
  return {
    question,
    answer: "",
    steps: 0,
  };
}

function failedBaselineResult(question: string, detail: string): BaselineResponse {
  return {
    question,
    answer: `Error del modelo base: ${detail}`,
    steps: 0,
  };
}

function failedGraphRagResult(question: string, detail: string): GraphRAGResponse {
  return {
    question,
    answer: `Error de GraphRAG: ${detail}`,
    results: null,
    steps: 0,
  };
}

function parseSseFrame<T>(frame: string): T | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data) {
    return null;
  }

  return JSON.parse(data) as T;
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

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function bestSystemLabel(values: Record<"semantic_agent" | "base_model" | "graph_rag", number>): string {
  const labels = {
    semantic_agent: "agente semántico",
    base_model: "modelo base",
    graph_rag: "GraphRAG",
  };
  const best = Object.entries(values).reduce((currentBest, candidate) =>
    candidate[1] > currentBest[1] ? candidate : currentBest,
  );

  return labels[best[0] as keyof typeof labels];
}

function extractUppercaseEntities(answer: string): string[] {
  const candidates =
    answer.match(/\b[A-ZÁÉÍÓÚÑ0-9-]{3,}(?:\s+[A-ZÁÉÍÓÚÑ0-9-]{3,})*\b/g) ?? [];

  return Array.from(new Set(candidates.map(normalizeText)));
}

function scoreAnswer(
  item: ExperimentQuestion,
  answer: string,
  latencyMs: number,
  steps: number,
  traceable: boolean,
): EvaluationMetrics {
  const normalizedAnswer = normalizeText(answer);
  let exactAccuracy = 0;
  let precision = 0;
  let recall = 0;
  let f1 = 0;
  let completeness = 0;
  let hallucinations = 0;

  if (item.expectedData.kind === "categories") {
    const matches = Object.entries(item.expectedData.values).filter(
      ([label, expectedCount]) => {
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`${escapedLabel}\\D+${expectedCount}`, "i");
        return pattern.test(answer);
      },
    ).length;
    exactAccuracy =
      matches === Object.keys(item.expectedData.values).length ? 1 : 0;
    completeness = matches / Object.keys(item.expectedData.values).length;
    precision = completeness;
    recall = completeness;
    f1 = completeness;
  }

  if (item.expectedData.kind === "count") {
    const containsCount = new RegExp(`\\b${item.expectedData.count}\\b`).test(
      answer,
    );
    exactAccuracy = containsCount ? 1 : 0;
    completeness = containsCount ? 1 : 0;
    precision = containsCount ? 1 : 0;
    recall = containsCount ? 1 : 0;
    f1 = containsCount ? 1 : 0;
  }

  if (item.expectedData.kind === "fields") {
    const matches = item.expectedData.fields.filter((field) =>
      normalizedAnswer.includes(normalizeText(field)),
    ).length;
    completeness = matches / item.expectedData.fields.length;
    exactAccuracy = matches === item.expectedData.fields.length ? 1 : 0;
    precision = completeness;
    recall = completeness;
    f1 = completeness;
  }

  if (item.expectedData.kind === "entities") {
    const expectedEntities = item.expectedData.entities.map(normalizeText);
    const extractedEntities = extractUppercaseEntities(answer).filter(
      (entity) => entity !== "EGFR",
    );
    const returnedEntities = expectedEntities.filter((entity) =>
      normalizedAnswer.includes(entity),
    );
    const returnedTotal = Math.max(extractedEntities.length, returnedEntities.length);
    precision =
      returnedTotal > 0 ? returnedEntities.length / returnedTotal : 0;
    recall = returnedEntities.length / expectedEntities.length;
    f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;
    completeness = recall;
    exactAccuracy = returnedEntities.length === expectedEntities.length ? 1 : 0;
    hallucinations = extractedEntities.filter(
      (entity) => !expectedEntities.includes(entity),
    ).length;
  }

  return {
    exactAccuracy,
    precision,
    recall,
    f1,
    completeness,
    hallucinations,
    traceability: traceable ? 1 : 0,
    latencyMs,
    steps,
  };
}

function summarizeExperimentRuns(runs: Record<string, ExperimentRun>) {
  const completedRuns = Object.values(runs).filter(
    (run) => run.semanticMetrics && run.baseMetrics && run.graphRagMetrics,
  );
  const semantic = completedRuns
    .map((run) => run.semanticMetrics)
    .filter((metrics): metrics is EvaluationMetrics => Boolean(metrics));
  const base = completedRuns
    .map((run) => run.baseMetrics)
    .filter((metrics): metrics is EvaluationMetrics => Boolean(metrics));
  const graphRag = completedRuns
    .map((run) => run.graphRagMetrics)
    .filter((metrics): metrics is EvaluationMetrics => Boolean(metrics));

  if (completedRuns.length === 0) {
    return null;
  }

  return {
    count: completedRuns.length,
    semantic: {
      exactAccuracy: average(semantic.map((metric) => metric.exactAccuracy)),
      precision: average(semantic.map((metric) => metric.precision)),
      recall: average(semantic.map((metric) => metric.recall)),
      f1: average(semantic.map((metric) => metric.f1)),
      completeness: average(semantic.map((metric) => metric.completeness)),
      hallucinations: average(semantic.map((metric) => metric.hallucinations)),
      traceability: average(semantic.map((metric) => metric.traceability)),
      latencyMs: average(semantic.map((metric) => metric.latencyMs)),
      steps: average(semantic.map((metric) => metric.steps)),
    },
    base: {
      exactAccuracy: average(base.map((metric) => metric.exactAccuracy)),
      precision: average(base.map((metric) => metric.precision)),
      recall: average(base.map((metric) => metric.recall)),
      f1: average(base.map((metric) => metric.f1)),
      completeness: average(base.map((metric) => metric.completeness)),
      hallucinations: average(base.map((metric) => metric.hallucinations)),
      traceability: average(base.map((metric) => metric.traceability)),
      latencyMs: average(base.map((metric) => metric.latencyMs)),
      steps: average(base.map((metric) => metric.steps)),
    },
    graphRag: {
      exactAccuracy: average(graphRag.map((metric) => metric.exactAccuracy)),
      precision: average(graphRag.map((metric) => metric.precision)),
      recall: average(graphRag.map((metric) => metric.recall)),
      f1: average(graphRag.map((metric) => metric.f1)),
      completeness: average(graphRag.map((metric) => metric.completeness)),
      hallucinations: average(graphRag.map((metric) => metric.hallucinations)),
      traceability: average(graphRag.map((metric) => metric.traceability)),
      latencyMs: average(graphRag.map((metric) => metric.latencyMs)),
      steps: average(graphRag.map((metric) => metric.steps)),
    },
  };
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
  const [experimentRuns, setExperimentRuns] = useState<Record<string, ExperimentRun>>({});
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [allExperimentsRunning, setAllExperimentsRunning] = useState(false);
  const backendReady = health?.status === "ok" && health?.ontology_ready;
  const experimentSummary = summarizeExperimentRuns(experimentRuns);
  const manualRun = experimentRuns[MANUAL_QUERY_RUN_ID] ?? null;
  const manualSemantic = manualRun?.semanticAgent ?? (
    selectedExperimentId === MANUAL_QUERY_RUN_ID ? result : null
  );
  const selectedExperiment = selectedExperimentId
    ? selectedExperimentId === MANUAL_QUERY_RUN_ID
      ? null
      : experimentRuns[selectedExperimentId]
    : null;

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
    setSelectedExperimentId(MANUAL_QUERY_RUN_ID);
    setExperimentRuns((current) => ({
      ...current,
      [MANUAL_QUERY_RUN_ID]: {
        state: "loading",
        semanticAgent: emptyResult(trimmedQuestion),
        baseModel: emptyBaselineResult(trimmedQuestion),
        graphRag: emptyGraphRagResult(trimmedQuestion),
      },
    }));

    try {
      const semanticFinal: { value?: AskResponse } = {};
      let semanticFailed = false;

      const handleStreamEvent = (event: StreamEvent) => {
        if (event.type === "answer_delta") {
          setResult((current) => ({
            ...(current ?? emptyResult(trimmedQuestion)),
            answer: `${current?.answer ?? ""}${event.delta}`,
            steps: event.step,
          }));
          setExperimentRuns((current) => {
            const run = current[MANUAL_QUERY_RUN_ID] ?? { state: "loading" as LoadState };
            const currentAgent = run.semanticAgent ?? emptyResult(trimmedQuestion);

            return {
              ...current,
              [MANUAL_QUERY_RUN_ID]: {
                ...run,
                state: "loading",
                semanticAgent: {
                  ...currentAgent,
                  answer: `${currentAgent.answer}${event.delta}`,
                  steps: event.step,
                },
              },
            };
          });
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
          semanticFailed = true;
          throw new Error(event.detail);
        }

        semanticFinal.value = event.payload;
        startTransition(() => {
          setResult((current) => ({
            ...event.payload,
            phases: mergePhases(current?.phases ?? [], event.payload.phases),
          }));
          setExperimentRuns((current) => ({
            ...current,
            [MANUAL_QUERY_RUN_ID]: {
              ...(current[MANUAL_QUERY_RUN_ID] ?? { state: "loading" }),
              state: "loading",
              semanticAgent: {
                ...event.payload,
                phases: mergePhases(
                  current[MANUAL_QUERY_RUN_ID]?.semanticAgent?.phases ?? [],
                  event.payload.phases,
                ),
              },
            },
          }));
        });
      };

      const semanticReader = await openStream("/api/ask/stream", trimmedQuestion);
      await readStream<StreamEvent>(semanticReader, handleStreamEvent);

      if (!semanticFinal.value || semanticFailed) {
        throw new Error("La conexión del agente terminó antes de recibir la respuesta final.");
      }

      try {
        const baseFinal: { value?: BaselineResponse } = {};
        const baseReader = await openStream("/api/baseline/stream", trimmedQuestion);
        await readStream<BaselineStreamEvent>(baseReader, (event) => {
          if (event.type === "answer_delta") {
            setExperimentRuns((current) => {
              const run = current[MANUAL_QUERY_RUN_ID] ?? { state: "loading" as LoadState };
              const currentBase = run.baseModel ?? emptyBaselineResult(trimmedQuestion);

              return {
                ...current,
                [MANUAL_QUERY_RUN_ID]: {
                  ...run,
                  state: "loading",
                  baseModel: {
                    ...currentBase,
                    answer: `${currentBase.answer}${event.delta}`,
                    steps: event.step,
                  },
                },
              };
            });
            return;
          }

          if (event.type === "error") {
            throw new Error(event.detail);
          }

          baseFinal.value = event.payload;
          setExperimentRuns((current) => ({
            ...current,
            [MANUAL_QUERY_RUN_ID]: {
              ...(current[MANUAL_QUERY_RUN_ID] ?? { state: "loading" }),
              state: "loading",
              baseModel: event.payload,
            },
          }));
        });

        if (!baseFinal.value) {
          throw new Error("La conexión del modelo base terminó antes de recibir la respuesta final.");
        }
      } catch (error) {
        const message = toErrorMessage(error);
        setExperimentRuns((current) => ({
          ...current,
          [MANUAL_QUERY_RUN_ID]: {
            ...(current[MANUAL_QUERY_RUN_ID] ?? { state: "loading" }),
            state: "loading",
            baseModel: failedBaselineResult(trimmedQuestion, message),
            error: message,
          },
        }));
      }

      try {
        const graphRagFinal: { value?: GraphRAGResponse } = {};
        const graphRagReader = await openStream("/api/graphrag/stream", trimmedQuestion);
        await readStream<GraphRAGStreamEvent>(graphRagReader, (event) => {
          if (event.type === "answer_delta") {
            setExperimentRuns((current) => {
              const run = current[MANUAL_QUERY_RUN_ID] ?? { state: "loading" as LoadState };
              const currentGraphRag = run.graphRag ?? emptyGraphRagResult(trimmedQuestion);

              return {
                ...current,
                [MANUAL_QUERY_RUN_ID]: {
                  ...run,
                  state: "loading",
                  graphRag: {
                    ...currentGraphRag,
                    answer: `${currentGraphRag.answer}${event.delta}`,
                    steps: event.step,
                  },
                },
              };
            });
            return;
          }

          if (event.type === "error") {
            throw new Error(event.detail);
          }

          graphRagFinal.value = event.payload;
          setExperimentRuns((current) => ({
            ...current,
            [MANUAL_QUERY_RUN_ID]: {
              ...(current[MANUAL_QUERY_RUN_ID] ?? { state: "loading" }),
              state: "loading",
              graphRag: event.payload,
            },
          }));
        });

        if (!graphRagFinal.value) {
          throw new Error("La conexión de GraphRAG terminó antes de recibir la respuesta final.");
        }
      } catch (error) {
        const message = toErrorMessage(error);
        setExperimentRuns((current) => ({
          ...current,
          [MANUAL_QUERY_RUN_ID]: {
            ...(current[MANUAL_QUERY_RUN_ID] ?? { state: "loading" }),
            state: "loading",
            graphRag: failedGraphRagResult(trimmedQuestion, message),
            error: message,
          },
        }));
      }

      setLoadState("success");
      setExperimentRuns((current) => ({
        ...current,
        [MANUAL_QUERY_RUN_ID]: {
          ...(current[MANUAL_QUERY_RUN_ID] ?? { state: "loading" }),
          state: "success",
        },
      }));
    } catch (error) {
      const message = toErrorMessage(error);
      setSubmitError(message);
      setLoadState("error");
      setExperimentRuns((current) => ({
        ...current,
        [MANUAL_QUERY_RUN_ID]: {
          ...(current[MANUAL_QUERY_RUN_ID] ?? {
            semanticAgent: emptyResult(trimmedQuestion),
            baseModel: emptyBaselineResult(trimmedQuestion),
            graphRag: emptyGraphRagResult(trimmedQuestion),
          }),
          state: "error",
          error: message,
        },
      }));
    }
  }

  async function openStream(path: string, question: string) {
    const response = await fetch(path, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ question }),
    });

    if (!response.ok || !response.body) {
      const payload = await readJson<ErrorResponse>(response);
      const detail =
        typeof payload === "object" && payload !== null && "detail" in payload
          ? String(payload.detail)
          : "Backend request failed";
      throw new Error(detail);
    }

    return response.body.getReader();
  }

  async function readStream<T>(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    handleStreamEvent: (event: T) => void,
  ) {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const event = parseSseFrame<T>(frame);
        if (event) {
          handleStreamEvent(event);
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const event = parseSseFrame<T>(buffer);
      if (event) {
        handleStreamEvent(event);
      }
    }
  }

  async function runExperiment(item: ExperimentQuestion) {
    setQuestion(item.question);
    setSelectedExperimentId(item.id);
    setLoadState("loading");
    setSubmitError(null);
    setResult(emptyResult(item.question));
    setExperimentRuns((current) => ({
      ...current,
      [item.id]: {
        state: "loading",
        semanticAgent: emptyResult(item.question),
        baseModel: { question: item.question, answer: "", steps: 0 },
        graphRag: emptyGraphRagResult(item.question),
      },
    }));

    try {
      const semanticStartedAt = performance.now();
      const semanticFinal: { value?: AskResponse } = {};
      let semanticFailed = false;

      const semanticReader = await openStream("/api/ask/stream", item.question);
      await readStream<StreamEvent>(semanticReader, (event) => {
        if (event.type === "answer_delta") {
          setResult((current) => ({
            ...(current ?? emptyResult(item.question)),
            answer: `${current?.answer ?? ""}${event.delta}`,
            steps: event.step,
          }));
          setExperimentRuns((current) => {
            const run = current[item.id] ?? { state: "loading" as LoadState };
            const currentAgent = run.semanticAgent ?? emptyResult(item.question);

            return {
              ...current,
              [item.id]: {
                ...run,
                state: "loading",
                semanticAgent: {
                  ...currentAgent,
                  answer: `${currentAgent.answer}${event.delta}`,
                  steps: event.step,
                },
              },
            };
          });
          return;
        }

        if (event.type === "phase") {
          setResult((current) => {
            const currentResult = current ?? emptyResult(item.question);
            const phases = currentResult.phases.includes(event.phase)
              ? currentResult.phases
              : [...currentResult.phases, event.phase];

            return { ...currentResult, phases, steps: event.step };
          });
          return;
        }

        if (event.type === "error") {
          semanticFailed = true;
          throw new Error(event.detail);
        }

        semanticFinal.value = event.payload;
        setResult((current) => ({
          ...event.payload,
          phases: mergePhases(current?.phases ?? [], event.payload.phases),
        }));
        setExperimentRuns((current) => ({
          ...current,
          [item.id]: {
            ...(current[item.id] ?? { state: "loading" }),
            state: "loading",
            semanticAgent: {
              ...event.payload,
              phases: mergePhases(current[item.id]?.semanticAgent?.phases ?? [], event.payload.phases),
            },
          },
        }));
      });

      if (!semanticFinal.value || semanticFailed) {
        throw new Error("La conexión del agente terminó antes de recibir la respuesta final.");
      }

      const semanticAgent = semanticFinal.value;
      const semanticLatencyMs = performance.now() - semanticStartedAt;
      const baseStartedAt = performance.now();
      const baseFinal: { value?: BaselineResponse } = {};
      let baseFailed = false;

      const baseReader = await openStream("/api/baseline/stream", item.question);
      await readStream<BaselineStreamEvent>(baseReader, (event) => {
        if (event.type === "answer_delta") {
          setExperimentRuns((current) => {
            const run = current[item.id] ?? { state: "loading" as LoadState };
            const currentBase = run.baseModel ?? {
              question: item.question,
              answer: "",
              steps: 0,
            };

            return {
              ...current,
              [item.id]: {
                ...run,
                state: "loading",
                baseModel: {
                  ...currentBase,
                  answer: `${currentBase.answer}${event.delta}`,
                  steps: event.step,
                },
              },
            };
          });
          return;
        }

        if (event.type === "error") {
          baseFailed = true;
          throw new Error(event.detail);
        }

        baseFinal.value = event.payload;
        setExperimentRuns((current) => ({
          ...current,
          [item.id]: {
            ...(current[item.id] ?? { state: "loading" }),
            state: "loading",
            baseModel: event.payload,
          },
        }));
      });

      if (!baseFinal.value || baseFailed) {
        throw new Error("La conexión del modelo base terminó antes de recibir la respuesta final.");
      }

      const baseModel = baseFinal.value;
      const baseLatencyMs = performance.now() - baseStartedAt;
      const graphRagStartedAt = performance.now();
      const graphRagFinal: { value?: GraphRAGResponse } = {};
      let graphRagFailed = false;

      const graphRagReader = await openStream("/api/graphrag/stream", item.question);
      await readStream<GraphRAGStreamEvent>(graphRagReader, (event) => {
        if (event.type === "answer_delta") {
          setExperimentRuns((current) => {
            const run = current[item.id] ?? { state: "loading" as LoadState };
            const currentGraphRag = run.graphRag ?? emptyGraphRagResult(item.question);

            return {
              ...current,
              [item.id]: {
                ...run,
                state: "loading",
                graphRag: {
                  ...currentGraphRag,
                  answer: `${currentGraphRag.answer}${event.delta}`,
                  steps: event.step,
                },
              },
            };
          });
          return;
        }

        if (event.type === "error") {
          graphRagFailed = true;
          throw new Error(event.detail);
        }

        graphRagFinal.value = event.payload;
        setExperimentRuns((current) => ({
          ...current,
          [item.id]: {
            ...(current[item.id] ?? { state: "loading" }),
            state: "loading",
            graphRag: event.payload,
          },
        }));
      });

      if (!graphRagFinal.value || graphRagFailed) {
        throw new Error("La conexión de GraphRAG terminó antes de recibir la respuesta final.");
      }

      const graphRag = graphRagFinal.value;
      const graphRagLatencyMs = performance.now() - graphRagStartedAt;

      const semanticMetrics = scoreAnswer(
        item,
        `${semanticAgent.answer}\n${formatJson(semanticAgent.results)}`,
        semanticLatencyMs,
        semanticAgent.steps,
        Boolean(semanticAgent.sparql && semanticAgent.results),
      );
      const baseMetrics = scoreAnswer(
        item,
        baseModel.answer,
        baseLatencyMs,
        baseModel.steps,
        false,
      );
      const graphRagMetrics = scoreAnswer(
        item,
        `${graphRag.answer}\n${formatJson(graphRag.results)}`,
        graphRagLatencyMs,
        graphRag.steps,
        graphRag.results !== null && graphRag.results !== undefined,
      );

      startTransition(() => {
        setResult(semanticAgent);
        setLoadState("success");
        setExperimentRuns((current) => ({
          ...current,
          [item.id]: {
            state: "success",
            semanticAgent,
            baseModel,
            graphRag,
            semanticMetrics,
            baseMetrics,
            graphRagMetrics,
          },
        }));
      });
    } catch (error) {
      const message = toErrorMessage(error);
      setSubmitError(message);
      setLoadState("error");
      setExperimentRuns((current) => ({
        ...current,
        [item.id]: {
          ...(current[item.id] ?? {
            semanticAgent: emptyResult(item.question),
            baseModel: emptyBaselineResult(item.question),
            graphRag: emptyGraphRagResult(item.question),
          }),
          state: "error",
          error: message,
        },
      }));
    }
  }

  async function runAllExperiments() {
    setAllExperimentsRunning(true);
    try {
      for (const item of EXPERIMENT_QUESTIONS) {
        await runExperiment(item);
      }
    } finally {
      setAllExperimentsRunning(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="app-header">
        <div className="content-frame app-header-inner">
          <div>
            <p className="brand-mark">Ontology Agent TFM</p>
            <p className="nav-copy">Universidad de Málaga · LLM y grafos de conocimiento</p>
          </div>
          <nav className="section-switch" aria-label="Secciones principales">
            <a href="#consulta-libre">Consulta libre</a>
            <a href="#experimento">Experimento</a>
          </nav>
          <span className={`status-pill ${backendReady ? "status-ok" : "status-warning"}`}>
            {backendReady ? "Backend listo" : "Comprobando backend"}
          </span>
        </div>
      </header>

      <section className="project-brief">
        <div className="content-frame brief-grid">
          <div>
            <p className="eyebrow">Proyecto de Fin de Máster</p>
            <h1>Evaluación de respuestas LLM apoyadas por grafos de conocimiento.</h1>
          </div>
          <div className="system-status" aria-label="Estado del backend">
            <dl className="status-grid compact-status-grid">
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
          </div>
        </div>
      </section>

      <section className="workspace-section query-workspace" id="consulta-libre">
        <div className="content-frame section-stack">
          <div className="section-heading">
            <div>
              <p className="panel-label">Parte 1</p>
              <h2>Consulta libre</h2>
            </div>
            <p className="section-copy">
              Formula cualquier pregunta y compara en una misma vista la respuesta
              del agente semántico, el modelo base y GraphRAG.
            </p>
          </div>

          <div className="free-query-layout">
            <form className="query-card query-form" onSubmit={handleSubmit}>
              <div className="panel-header">
                <div>
                  <p className="panel-label">Entrada</p>
                  <h3>Pregunta para la ontología</h3>
                </div>
                <span className={`request-state request-${loadState}`}>
                  {getRequestLabel(loadState)}
                </span>
              </div>
              <label className="field-label" htmlFor="question">
                Pregunta para la ontología
              </label>
              <textarea
                id="question"
                className="question-input"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={7}
                placeholder="¿Qué dianas están asociadas al fármaco ABALOPARATIDE?"
              />
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
              <div className="actions">
                <button
                  className="submit-button"
                  type="submit"
                  disabled={loadState === "loading"}
                >
                  {loadState === "loading" ? "Consultando..." : "Consultar"}
                </button>
                <p className="helper-copy">
                  La consulta libre no altera la matriz del experimento.
                </p>
              </div>
              {submitError ? (
                <div className="message error-box" role="alert">
                  {submitError}
                </div>
              ) : null}
            </form>

            <aside className="trace-panel" id="traceability">
              <div className="trace-header">
                <p className="panel-label">Trazabilidad</p>
                <h3>SPARQL y evidencias del agente</h3>
              </div>
              <div className="debug-block">
                <h4>SPARQL</h4>
                <pre className="code-block">
                  {manualSemantic?.sparql ?? "Aún no hay consulta."}
                </pre>
              </div>
              <div className="debug-block">
                <h4>Resultados crudos</h4>
                <pre className="code-block">
                  {manualSemantic ? formatJson(manualSemantic.results) : "Aún no hay resultados."}
                </pre>
              </div>
            </aside>
          </div>

          <div className="model-answer-grid" aria-label="Respuestas de la consulta libre">
            <article className="model-answer model-answer-primary">
              <div className="model-answer-header">
                <div>
                  <p className="panel-label">semantic_agent</p>
                  <h3>Agente semántico</h3>
                </div>
                <span className="steps-pill">{manualSemantic?.steps ?? 0} pasos</span>
              </div>
              <p>
                {manualSemantic?.answer ||
                  "Ejecuta una pregunta para ver la respuesta con SPARQL y resultados verificables."}
              </p>
              <div className="phase-list" aria-label="Execution phases">
                {(manualSemantic?.phases ?? []).map((phase) => (
                  <span className="phase-chip" key={phase}>
                    {PHASE_LABELS[phase] ?? phase}
                  </span>
                ))}
              </div>
            </article>
            <article className="model-answer">
              <div className="model-answer-header">
                <div>
                  <p className="panel-label">base_model</p>
                  <h3>Modelo base</h3>
                </div>
                <span className="steps-pill">{manualRun?.baseModel?.steps ?? 0} pasos</span>
              </div>
              <p>
                {manualRun?.baseModel?.answer ||
                  "La respuesta del modelo base aparecerá aquí cuando termine la consulta libre."}
              </p>
            </article>
            <article className="model-answer">
              <div className="model-answer-header">
                <div>
                  <p className="panel-label">graph_rag</p>
                  <h3>GraphRAG</h3>
                </div>
                <span className="steps-pill">{manualRun?.graphRag?.steps ?? 0} pasos</span>
              </div>
              <p>
                {manualRun?.graphRag?.answer ||
                  "La respuesta GraphRAG aparecerá aquí si el servicio externo está disponible."}
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="workspace-section experiment-workspace" id="experimento">
        <div className="content-frame comparison-layout">
          <div className="section-heading">
            <div>
              <p className="panel-label">Evaluación comparativa</p>
              <h2>Experimento y métricas</h2>
            </div>
            <p className="section-copy">
              Ejecuta las preguntas predefinidas del protocolo y revisa las
              medidas de exactitud, precisión, recall, F1, completitud,
              alucinaciones, trazabilidad y latencia.
            </p>
          </div>

          <div className="experiment-stat-grid" aria-label="Resumen del experimento">
            {EXPERIMENT_STATS.map((stat) => (
              <div className="experiment-stat-card" key={stat.label}>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>

          <div className="comparison-system-grid">
            {SYSTEM_COMPARISON.map((system) => (
              <article className="comparison-card" key={system.id}>
                <div>
                  <p className="panel-label">{system.id}</p>
                  <h3>{system.label}</h3>
                  <p>{system.summary}</p>
                </div>
                <div className="comparison-chip-list" aria-label={`Rasgos de ${system.label}`}>
                  {system.chips.map((chip) => (
                    <span className="comparison-chip" key={chip}>
                      {chip}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="evaluation-panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Última ejecución experimental</p>
                <h3>Respuestas comparadas</h3>
              </div>
              <span className="request-state">
                {selectedExperiment?.state === "loading"
                  ? "Ejecutando"
                  : selectedExperiment?.state === "success"
                    ? "Completado"
                    : "Pendiente"}
              </span>
            </div>
            <div className="answer-comparison-grid">
              <article className="answer-comparison-card">
                <p className="panel-label">semantic_agent</p>
                <h4>Agente semántico</h4>
                <p>
                  {selectedExperiment?.semanticAgent?.answer ||
                    "Ejecuta una pregunta para ver la respuesta del agente."}
                </p>
              </article>
              <article className="answer-comparison-card">
                <p className="panel-label">base_model</p>
                <h4>Modelo base</h4>
                <p>
                  {selectedExperiment?.baseModel?.answer ||
                    "La respuesta del modelo base aparecerá aquí por lotes."}
                </p>
              </article>
              <article className="answer-comparison-card">
                <p className="panel-label">graph_rag</p>
                <h4>GraphRAG</h4>
                <p>
                  {selectedExperiment?.graphRag?.answer ||
                    "La respuesta GraphRAG aparecerá aquí cuando el servicio esté disponible."}
                </p>
              </article>
            </div>
          </div>

          <div className="evaluation-panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Consultas</p>
                <h3>Preguntas y verdad de referencia</h3>
              </div>
              <button
                className="table-action-button table-action-primary"
                type="button"
                disabled={allExperimentsRunning || loadState === "loading"}
                onClick={() => void runAllExperiments()}
              >
                {allExperimentsRunning ? "Ejecutando..." : "Ejecutar todos"}
              </button>
            </div>
            <div className="comparison-table-wrap">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Pregunta</th>
                    <th>Referencia esperada</th>
                    <th>Métrica principal</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPERIMENT_QUESTIONS.map((item) => (
                    <tr key={item.id}>
                      <td>{item.question}</td>
                      <td>{item.expected}</td>
                      <td>{item.metric}</td>
                      <td>
                        <button
                          className="table-action-button"
                          type="button"
                          disabled={allExperimentsRunning || loadState === "loading"}
                          onClick={() => void runExperiment(item)}
                        >
                          {experimentRuns[item.id]?.state === "loading"
                            ? "Ejecutando..."
                            : "Cargar"}
                        </button>
                        {experimentRuns[item.id]?.state === "success" ? (
                          <span className="row-status">Hecho</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="evaluation-panel">
            <div className="panel-header">
              <div>
                <p className="panel-label">Métricas</p>
                <h3>Matriz de comparación</h3>
              </div>
              <span className="request-state">
                {experimentSummary
                  ? `${experimentSummary.count}/${EXPERIMENT_QUESTIONS.length} ejecutadas`
                  : "Pendiente"}
              </span>
            </div>
            <div className="comparison-table-wrap">
              <table className="comparison-table metric-table">
                <thead>
                  <tr>
                    <th>Métrica</th>
                    <th>Agente semántico</th>
                    <th>Modelo base</th>
                    <th>GraphRAG</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Exactitud</td>
                    <td>
                      {experimentSummary
                        ? formatPercent(experimentSummary.semantic.exactAccuracy)
                        : "Medida contra la referencia RDF"}
                    </td>
                    <td>
                      {experimentSummary
                        ? formatPercent(experimentSummary.base.exactAccuracy)
                        : "Medida contra la misma referencia"}
                    </td>
                    <td>
                      {experimentSummary
                        ? formatPercent(experimentSummary.graphRag.exactAccuracy)
                        : "Medida contra la evidencia recuperada"}
                    </td>
                    <td>
                      <span className={experimentSummary ? "result-badge" : "pending-badge"}>
                        {experimentSummary
                          ? `Mejor: ${bestSystemLabel({
                              semantic_agent: experimentSummary.semantic.exactAccuracy,
                              base_model: experimentSummary.base.exactAccuracy,
                              graph_rag: experimentSummary.graphRag.exactAccuracy,
                            })}`
                          : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Precision / recall / F1</td>
                    <td>
                      {experimentSummary
                        ? `${formatPercent(experimentSummary.semantic.precision)} / ${formatPercent(
                            experimentSummary.semantic.recall,
                          )} / ${formatPercent(experimentSummary.semantic.f1)}`
                        : "Listas extraídas desde resultados SPARQL"}
                    </td>
                    <td>
                      {experimentSummary
                        ? `${formatPercent(experimentSummary.base.precision)} / ${formatPercent(
                            experimentSummary.base.recall,
                          )} / ${formatPercent(experimentSummary.base.f1)}`
                        : "Listas extraídas de texto libre"}
                    </td>
                    <td>
                      {experimentSummary
                        ? `${formatPercent(experimentSummary.graphRag.precision)} / ${formatPercent(
                            experimentSummary.graphRag.recall,
                          )} / ${formatPercent(experimentSummary.graphRag.f1)}`
                        : "Listas extraídas de respuesta y evidencia"}
                    </td>
                    <td>
                      <span className={experimentSummary ? "result-badge" : "pending-badge"}>
                        {experimentSummary
                          ? `Mejor: ${bestSystemLabel({
                              semantic_agent: experimentSummary.semantic.f1,
                              base_model: experimentSummary.base.f1,
                              graph_rag: experimentSummary.graphRag.f1,
                            })}`
                          : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Completitud</td>
                    <td>
                      {experimentSummary
                        ? formatPercent(experimentSummary.semantic.completeness)
                        : "Campos esperados presentes en la respuesta"}
                    </td>
                    <td>
                      {experimentSummary
                        ? formatPercent(experimentSummary.base.completeness)
                        : "Campos esperados presentes en la respuesta"}
                    </td>
                    <td>
                      {experimentSummary
                        ? formatPercent(experimentSummary.graphRag.completeness)
                        : "Campos esperados presentes en respuesta/evidencia"}
                    </td>
                    <td>
                      <span className={experimentSummary ? "result-badge" : "pending-badge"}>
                        {experimentSummary
                          ? `Mejor: ${bestSystemLabel({
                              semantic_agent: experimentSummary.semantic.completeness,
                              base_model: experimentSummary.base.completeness,
                              graph_rag: experimentSummary.graphRag.completeness,
                            })}`
                          : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Alucinaciones</td>
                    <td>
                      {experimentSummary
                        ? experimentSummary.semantic.hallucinations.toFixed(1)
                        : "Entidades fuera de la referencia"}
                    </td>
                    <td>
                      {experimentSummary
                        ? experimentSummary.base.hallucinations.toFixed(1)
                        : "Entidades fuera de la referencia"}
                    </td>
                    <td>
                      {experimentSummary
                        ? experimentSummary.graphRag.hallucinations.toFixed(1)
                        : "Entidades fuera de la referencia"}
                    </td>
                    <td>
                      <span className={experimentSummary ? "result-badge" : "pending-badge"}>
                        {experimentSummary ? "Calculado" : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Trazabilidad</td>
                    <td>
                      {experimentSummary
                        ? formatPercent(experimentSummary.semantic.traceability)
                        : "SPARQL + resultados estructurados"}
                    </td>
                    <td>
                      {experimentSummary
                        ? formatPercent(experimentSummary.base.traceability)
                        : "No disponible por diseño"}
                    </td>
                    <td>
                      {experimentSummary
                        ? formatPercent(experimentSummary.graphRag.traceability)
                        : "Respuesta + evidencia recuperada"}
                    </td>
                    <td>
                      <span className={experimentSummary ? "result-badge" : "pending-badge"}>
                        {experimentSummary ? "Comparado" : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Latencia</td>
                    <td>
                      {experimentSummary
                        ? `${Math.round(experimentSummary.semantic.latencyMs)} ms · ${experimentSummary.semantic.steps.toFixed(
                            1,
                          )} pasos`
                        : "Tiempo total y pasos del agente"}
                    </td>
                    <td>
                      {experimentSummary
                        ? `${Math.round(experimentSummary.base.latencyMs)} ms`
                        : "Tiempo total de respuesta"}
                    </td>
                    <td>
                      {experimentSummary
                        ? `${Math.round(experimentSummary.graphRag.latencyMs)} ms · ${experimentSummary.graphRag.steps.toFixed(
                            1,
                          )} pasos`
                        : "Tiempo total del servicio GraphRAG"}
                    </td>
                    <td>
                      <span className={experimentSummary ? "result-badge" : "pending-badge"}>
                        {experimentSummary ? "Medida" : "Pendiente"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="interpretation-panel">
            <p className="panel-label">Interpretación</p>
            <h3>Qué debería evidenciar la capa semántica</h3>
            <p>
              La mejora será clara si los sistemas con grafo obtienen mayor
              exactitud y F1, reducen alucinaciones y mantienen trazabilidad
              mediante SPARQL, resultados estructurados o evidencia recuperada.
              Una latencia superior es aceptable si la verificabilidad compensa
              el coste operativo.
            </p>
          </div>
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
