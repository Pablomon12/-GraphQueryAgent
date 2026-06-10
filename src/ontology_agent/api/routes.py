from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ontology_agent.agent import OntologyAgent
from ontology_agent.clients import GraphRAGClient, LLMClient
from ontology_agent.config import Settings
from ontology_agent.ontology import OntologyExplorer
from ontology_agent.schemas import (
    AskRequest,
    AskResponse,
    BaselineResponse,
    GraphRAGResponse,
    HealthResponse,
)


def create_router(
    *,
    agent: OntologyAgent,
    ontology_explorer: OntologyExplorer,
    settings: Settings,
    llm_client: LLMClient | None = None,
    graphrag_client: GraphRAGClient | None = None,
) -> APIRouter:
    router = APIRouter()

    @router.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok" if settings.ontology_exists() else "degraded",
            ontology_paths=[str(path) for path in settings.ontology_paths],
            ontology_ready=bool(ontology_explorer.list_ontology_files()),
            fuseki_query_endpoint=settings.fuseki_query_endpoint,
            graphrag_api_base_url=settings.graphrag_api_base_url,
            openai_model=settings.openai_model,
        )

    @router.post("/ask", response_model=AskResponse)
    def ask(request: AskRequest) -> AskResponse:
        try:
            result = agent.ask(request.question)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Agent execution failed: {exc}") from exc

        return AskResponse(**result)

    @router.post("/baseline", response_model=BaselineResponse)
    def baseline(request: AskRequest) -> BaselineResponse:
        if llm_client is None:
            raise HTTPException(status_code=503, detail="Baseline model is not configured")

        messages = _baseline_messages(request.question)

        try:
            raw_response = llm_client.call(messages)
            payload = _parse_json_object(raw_response)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Baseline execution failed: {exc}") from exc

        return BaselineResponse(
            question=request.question,
            answer=str(payload.get("answer", "")),
        )

    @router.post("/graphrag", response_model=GraphRAGResponse)
    def graphrag(request: AskRequest) -> GraphRAGResponse:
        if graphrag_client is None:
            raise HTTPException(status_code=503, detail="GraphRAG service is not configured")

        try:
            payload = graphrag_client.ask(request.question)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"GraphRAG execution failed: {exc}") from exc

        return _graphrag_response(request.question, payload)

    @router.post("/graphrag/stream")
    def graphrag_stream(request: AskRequest) -> StreamingResponse:
        def event_stream() -> Iterator[str]:
            if graphrag_client is None:
                yield _sse_error("GraphRAG service is not configured")
                return

            try:
                payload = graphrag_client.ask(request.question)
                response = _graphrag_response(request.question, payload)
                if response.answer:
                    yield _sse_event(
                        "answer_delta",
                        {
                            "type": "answer_delta",
                            "delta": response.answer,
                            "step": response.steps,
                        },
                    )
                yield _sse_event(
                    "final",
                    {
                        "type": "final",
                        "payload": response.model_dump(),
                    },
                )
            except Exception as exc:
                yield _sse_error(f"GraphRAG execution failed: {exc}")

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    @router.post("/baseline/stream")
    def baseline_stream(request: AskRequest) -> StreamingResponse:
        def event_stream() -> Iterator[str]:
            if llm_client is None:
                yield _sse_error("Baseline model is not configured")
                return

            messages = _baseline_messages(request.question)
            raw_response = ""
            streamed_answer = ""

            try:
                stream = getattr(llm_client, "stream", None)
                chunks = stream(messages) if callable(stream) else [llm_client.call(messages)]

                for chunk in chunks:
                    raw_response += chunk
                    answer_prefix = OntologyAgent._extract_json_string_value_prefix(
                        raw_response,
                        "answer",
                    )
                    if answer_prefix.startswith(streamed_answer):
                        delta = answer_prefix[len(streamed_answer) :]
                        if delta:
                            streamed_answer = answer_prefix
                            yield _sse_event(
                                "answer_delta",
                                {
                                    "type": "answer_delta",
                                    "delta": delta,
                                    "step": 1,
                                },
                            )

                payload = _parse_json_object(raw_response)
                answer = str(payload.get("answer", ""))
                if answer.startswith(streamed_answer):
                    delta = answer[len(streamed_answer) :]
                    if delta:
                        yield _sse_event(
                            "answer_delta",
                            {
                                "type": "answer_delta",
                                "delta": delta,
                                "step": 1,
                            },
                        )

                yield _sse_event(
                    "final",
                    {
                        "type": "final",
                        "payload": {
                            "question": request.question,
                            "answer": answer,
                            "steps": 1,
                        },
                    },
                )
            except Exception as exc:
                yield _sse_error(f"Baseline execution failed: {exc}")

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    @router.post("/ask/stream")
    def ask_stream(request: AskRequest) -> StreamingResponse:
        def event_stream() -> Iterator[str]:
            try:
                for event in agent.ask_stream(request.question):
                    event_type = str(event.get("type", "message"))
                    yield (
                        f"event: {event_type}\n"
                        f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    )
            except FileNotFoundError as exc:
                yield _sse_error(str(exc))
            except Exception as exc:
                yield _sse_error(f"Agent execution failed: {exc}")

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    return router


def _sse_error(detail: str) -> str:
    return _sse_event("error", {"type": "error", "detail": detail})


def _sse_event(event_type: str, payload: dict[str, Any]) -> str:
    return (
        f"event: {event_type}\n"
        f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
    )


def _baseline_messages(question: str) -> list[dict[str, Any]]:
    return [
        {
            "role": "system",
            "content": (
                "Responde a la pregunta del usuario solo con conocimiento "
                "paramétrico. No uses herramientas, ontologías, SPARQL, "
                "archivos ni contexto externo. Devuelve JSON válido con la "
                "clave 'answer'."
            ),
        },
        {"role": "user", "content": question},
    ]


def _graphrag_response(question: str, payload: dict[str, Any]) -> GraphRAGResponse:
    answer = payload.get("answer") or payload.get("response") or payload.get("result") or ""
    results = (
        payload.get("results")
        if "results" in payload
        else payload.get("evidence")
        if "evidence" in payload
        else payload.get("context")
        if "context" in payload
        else payload
    )
    steps = payload.get("steps", 1)

    return GraphRAGResponse(
        question=str(payload.get("question") or question),
        answer=str(answer),
        results=results,
        steps=int(steps) if isinstance(steps, int | str) and str(steps).isdigit() else 1,
    )


def _parse_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```json"):
        text = text.removeprefix("```json").removesuffix("```").strip()
    elif text.startswith("```"):
        text = text.removeprefix("```").removesuffix("```").strip()

    payload = json.loads(text)
    if not isinstance(payload, dict):
        raise ValueError("Baseline response must be a JSON object")

    return payload
