from __future__ import annotations

from typing import Literal
from typing import Any

from pydantic import BaseModel, Field

LLMProvider = Literal["openai", "huggingface"]


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    llm_provider: LLMProvider = "openai"


class AskResponse(BaseModel):
    question: str
    sparql: str | None
    results: Any
    answer: str
    phases: list[str] = Field(default_factory=list)
    steps: int


class BaselineResponse(BaseModel):
    question: str
    answer: str
    steps: int = 1


class GraphRAGResponse(BaseModel):
    question: str
    answer: str
    results: Any = None
    steps: int = 1


class LLMProviderInfo(BaseModel):
    id: LLMProvider
    label: str
    model: str
    configured: bool


class HealthResponse(BaseModel):
    status: str
    ontology_paths: list[str]
    ontology_ready: bool
    fuseki_query_endpoint: str
    graphrag_api_base_url: str
    default_llm_provider: LLMProvider
    llm_providers: list[LLMProviderInfo]
    openai_model: str
