import os
from pathlib import Path

from rdflib import RDF, Graph, Namespace
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ontology_agent.agent import OntologyAgent
from ontology_agent.api.routes import create_router
from ontology_agent.config import Settings, load_dotenv_if_present
from ontology_agent.clients.sparql import SparqlClient
from ontology_agent.main import app, settings
from ontology_agent.ontology import OntologyExplorer


def test_health_endpoint_reports_ready_ontology() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["ontology_ready"] is True
    assert payload["ontology_paths"] == [str(path) for path in settings.ontology_paths]


def test_ontology_explorer_discovers_files_and_schema() -> None:
    explorer = OntologyExplorer((Path("knowledge/ontology"), Path("knowledge/data")))

    files = explorer.list_ontology_files()
    prefixes = explorer.list_prefixes()
    classes = explorer.list_classes()
    properties = explorer.list_properties()
    drug_uri = "https://example.org/farmacos-aprobados/ontology#Drug"
    property_uri = "https://example.org/farmacos-aprobados/ontology#hasInteraction"
    individuals = explorer.list_individuals(drug_uri)
    profile = explorer.get_class_profile(drug_uri)
    usage = explorer.get_usage_examples(property_uri)
    summary = explorer.get_schema_summary()

    assert files == [
        "knowledge/ontology/farmacos_aprobados.ttl",
        "knowledge/data/farm_aprobados_inst.ttl",
    ]
    assert any(item["prefix"] == "" for item in prefixes)
    assert any(item["uri"].endswith("#Drug") for item in classes)
    assert any(item["uri"].endswith("#hasInteraction") for item in properties)
    assert individuals != []
    assert all(drug_uri in item["types"] for item in individuals)
    assert profile["instance_count"] > 0
    assert any(item["uri"].endswith("#hasInteraction") for item in profile["top_properties"])
    assert usage != []
    assert summary["class_count"] >= 8
    assert any(samples for samples in summary["sample_individuals"].values())


def test_load_dotenv_if_present_populates_missing_values(tmp_path, monkeypatch) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text(
        'OPENAI_API_KEY="from-dotenv"\nOPENAI_MODEL=gpt-test\n',
        encoding="utf-8",
    )
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_MODEL", "from-environment")

    load_dotenv_if_present(env_path)

    assert os.environ["OPENAI_API_KEY"] == "from-dotenv"
    assert os.environ["OPENAI_MODEL"] == "from-environment"


class _FakeLLMClient:
    def __init__(self, responses: list[str]) -> None:
        self._responses = responses
        self.calls: list[list[dict[str, object]]] = []

    def call(self, messages: list[dict[str, object]]) -> str:
        self.calls.append(messages.copy())
        return self._responses.pop(0)


class _FakeStreamingLLMClient:
    def __init__(self, responses: list[list[str]]) -> None:
        self._responses = responses
        self.calls: list[list[dict[str, object]]] = []

    def stream(self, messages: list[dict[str, object]]):
        self.calls.append(messages.copy())
        yield from self._responses.pop(0)


class _FakeSparqlClient:
    def run_query(self, query: str) -> dict[str, object]:
        return {"head": {"vars": ["patient"]}, "results": {"bindings": []}}


class _FakeStreamingAgent:
    def ask_stream(self, question: str):
        yield {"type": "answer_delta", "delta": f"Respuesta a {question}", "step": 1}
        yield {
            "type": "final",
            "payload": {
                "question": question,
                "sparql": "SELECT * WHERE { ?s ?p ?o } LIMIT 1",
                "results": {"ok": True},
                "answer": f"Respuesta a {question}",
                "phases": ["reporting"],
                "steps": 1,
            },
        }


def test_agent_uses_plain_messages_for_tool_results() -> None:
    explorer = OntologyExplorer((Path("knowledge/ontology"), Path("knowledge/data")))
    llm_client = _FakeLLMClient(
        [
            '{"tool":"get_schema_summary","args":{}}',
            '{"final":true,"sparql":"SELECT * WHERE { ?s ?p ?o } LIMIT 1","results":{"ok":true},"answer":"Sin pacientes.","phases":["planning","schema_discovery","execution","reporting"]}',
        ]
    )
    agent = OntologyAgent(
        llm_client=llm_client,
        ontology_explorer=explorer,
        sparql_client=_FakeSparqlClient(),  # type: ignore[arg-type]
    )

    result = agent.ask("¿Qué pacientes tienen diagnóstico de diabetes?")

    assert result["answer"] == "Sin pacientes."
    second_call_messages = llm_client.calls[1]
    assert second_call_messages[-1]["role"] == "user"
    assert "Tool result for 'get_schema_summary'" in str(second_call_messages[-1]["content"])


def test_agent_streams_answer_deltas_and_final_payload() -> None:
    explorer = OntologyExplorer((Path("knowledge/ontology"), Path("knowledge/data")))
    llm_client = _FakeStreamingLLMClient(
        [
            ['{"tool":"get_schema_summary","args":{}}'],
            [
                '{"final":true,"sparql":"SELECT * WHERE { ?s ?p ?o } LIMIT 1",',
                '"results":{"ok":true},"answer":"Respuesta ',
                'fluida.","phases":["planning","reporting"]}',
            ],
        ]
    )
    agent = OntologyAgent(
        llm_client=llm_client,  # type: ignore[arg-type]
        ontology_explorer=explorer,
        sparql_client=_FakeSparqlClient(),  # type: ignore[arg-type]
    )

    events = list(agent.ask_stream("Pregunta"))

    deltas = [event["delta"] for event in events if event["type"] == "answer_delta"]
    final_event = next(event for event in events if event["type"] == "final")
    assert "".join(deltas) == "Respuesta fluida."
    assert final_event["payload"]["answer"] == "Respuesta fluida."
    assert final_event["payload"]["steps"] == 2


def test_stream_endpoint_returns_sse_events() -> None:
    test_app = FastAPI()
    explorer = OntologyExplorer((Path("knowledge/ontology"), Path("knowledge/data")))
    test_app.include_router(
        create_router(
            agent=_FakeStreamingAgent(),  # type: ignore[arg-type]
            ontology_explorer=explorer,
            settings=Settings.from_env(),
        )
    )
    client = TestClient(test_app)

    with client.stream("POST", "/ask/stream", json={"question": "osteoporosis"}) as response:
        body = response.read().decode()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: answer_delta" in body
    assert "event: final" in body
    assert '"answer": "Respuesta a osteoporosis"' in body


def test_settings_support_default_and_legacy_ontology_paths(monkeypatch) -> None:
    monkeypatch.delenv("ONTOLOGY_PATHS", raising=False)
    monkeypatch.delenv("ONTOLOGY_PATH", raising=False)
    default_settings = Settings.from_env()
    assert default_settings.ontology_paths == (Path("knowledge/ontology"), Path("knowledge/data"))

    monkeypatch.setenv("ONTOLOGY_PATH", "custom/ontology")
    legacy_settings = Settings.from_env()
    assert legacy_settings.ontology_paths == (Path("custom/ontology"),)

    monkeypatch.setenv("ONTOLOGY_PATHS", "first/path,second/path,first/path")
    multi_settings = Settings.from_env()
    assert multi_settings.ontology_paths == (Path("first/path"), Path("second/path"))


def test_fuseki_configuration_publishes_union_default_graph() -> None:
    graph = Graph()
    graph.parse("docker/fuseki-config.ttl", format="turtle")

    fuseki = Namespace("http://jena.apache.org/fuseki#")
    tdb2 = Namespace("http://jena.apache.org/2016/tdb#")
    service = next(graph.subjects(RDF.type, fuseki.Service))
    dataset = graph.value(service, fuseki.dataset)

    assert graph.value(service, fuseki.name) is not None
    assert graph.value(dataset, RDF.type) == tdb2.DatasetTDB2
    assert str(graph.value(dataset, tdb2.location)) == "/fuseki/databases/dataset"
    assert str(graph.value(dataset, tdb2.unionDefaultGraph)).lower() == "true"
