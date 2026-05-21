from __future__ import annotations

import json
from collections.abc import Iterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ontology_agent.agent import OntologyAgent
from ontology_agent.config import Settings
from ontology_agent.ontology import OntologyExplorer
from ontology_agent.schemas import AskRequest, AskResponse, HealthResponse


def create_router(
    *,
    agent: OntologyAgent,
    ontology_explorer: OntologyExplorer,
    settings: Settings,
) -> APIRouter:
    router = APIRouter()

    @router.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok" if settings.ontology_exists() else "degraded",
            ontology_paths=[str(path) for path in settings.ontology_paths],
            ontology_ready=bool(ontology_explorer.list_ontology_files()),
            fuseki_query_endpoint=settings.fuseki_query_endpoint,
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
    return (
        "event: error\n"
        f"data: {json.dumps({'type': 'error', 'detail': detail}, ensure_ascii=False)}\n\n"
    )
