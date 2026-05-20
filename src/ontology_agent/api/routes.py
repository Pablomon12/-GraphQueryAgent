from __future__ import annotations

from fastapi import APIRouter, HTTPException

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
            ontology_path=str(settings.ontology_path),
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

    return router

