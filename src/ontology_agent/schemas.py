from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)


class AskResponse(BaseModel):
    question: str
    sparql: str | None
    results: Any
    answer: str
    phases: list[str] = Field(default_factory=list)
    steps: int


class HealthResponse(BaseModel):
    status: str
    ontology_path: str
    ontology_ready: bool
    fuseki_query_endpoint: str
    openai_model: str
