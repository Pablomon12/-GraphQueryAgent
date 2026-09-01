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
sparql_client = SparqlClient(query_endpoint=settings.fuseki_query_endpoint)
graphrag_client = GraphRAGClient(base_url=settings.graphrag_api_base_url)
llm_clients = {
    "openai": LLMClient(model=settings.openai_model),
    "huggingface": LLMClient(
        model=settings.hf_model,
        provider="huggingface",
        api_key_env="HF_TOKEN",
        base_url=settings.hf_base_url,
    ),
}
agents = {
    provider: OntologyAgent(
        llm_client=client,
        ontology_explorer=ontology_explorer,
        sparql_client=sparql_client,
        max_steps=settings.max_steps,
    )
    for provider, client in llm_clients.items()
}
llm_client = llm_clients[settings.default_llm_provider]
agent = agents[settings.default_llm_provider]

app = FastAPI(title="Ontology Agent API", version="0.1.0")
app.include_router(
    create_router(
        agent=agent,
        agents=agents,
        ontology_explorer=ontology_explorer,
        settings=settings,
        llm_client=llm_client,
        llm_clients=llm_clients,
        graphrag_client=graphrag_client,
    )
)
