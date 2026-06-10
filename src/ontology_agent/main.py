from __future__ import annotations

from fastapi import FastAPI

from ontology_agent.agent import OntologyAgent
from ontology_agent.api.routes import create_router
from ontology_agent.clients import GraphRAGClient, LLMClient, SparqlClient
from ontology_agent.config import Settings
from ontology_agent.ontology import OntologyExplorer

settings = Settings.from_env()
ontology_explorer = OntologyExplorer(
    ontology_paths=settings.ontology_paths,
    ontology_glob=settings.ontology_glob,
)
llm_client = LLMClient(model=settings.openai_model)
sparql_client = SparqlClient(query_endpoint=settings.fuseki_query_endpoint)
graphrag_client = GraphRAGClient(base_url=settings.graphrag_api_base_url)
agent = OntologyAgent(
    llm_client=llm_client,
    ontology_explorer=ontology_explorer,
    sparql_client=sparql_client,
    max_steps=settings.max_steps,
)

app = FastAPI(title="Ontology Agent API", version="0.1.0")
app.include_router(
    create_router(
        agent=agent,
        ontology_explorer=ontology_explorer,
        settings=settings,
        llm_client=llm_client,
        graphrag_client=graphrag_client,
    )
)
