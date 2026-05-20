import os
from pathlib import Path

from fastapi.testclient import TestClient

from ontology_agent.agent import OntologyAgent
from ontology_agent.config import load_dotenv_if_present
from ontology_agent.clients.sparql import SparqlClient
from ontology_agent.main import app
from ontology_agent.ontology import OntologyExplorer


def test_health_endpoint_reports_ready_ontology() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["ontology_ready"] is True
    assert payload["ontology_path"] == "knowledge/ontology"


def test_ontology_explorer_discovers_files_and_schema() -> None:
    explorer = OntologyExplorer(Path("knowledge/ontology"))

    files = explorer.list_ontology_files()
    prefixes = explorer.list_prefixes()
    classes = explorer.list_classes()
    properties = explorer.list_properties()
    individuals = explorer.list_individuals("http://example.org/health#Patient")
    profile = explorer.get_class_profile("http://example.org/health#Patient")
    usage = explorer.get_usage_examples("http://example.org/health#hasDiagnosis")
    summary = explorer.get_schema_summary()

    assert files == ["knowledge/ontology/example.ttl"]
    assert any(item["prefix"] == "ex" for item in prefixes)
    assert any(item["uri"].endswith("#Patient") for item in classes)
    assert any(item["uri"].endswith("#hasDiagnosis") for item in properties)
    assert individuals == []
    assert profile["instance_count"] == 0
    assert profile["top_properties"] == []
    assert usage == []
    assert summary["class_count"] >= 2
    assert summary["sample_individuals"]["http://example.org/health#Patient"] == []


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


class _FakeSparqlClient:
    def run_query(self, query: str) -> dict[str, object]:
        return {"head": {"vars": ["patient"]}, "results": {"bindings": []}}


def test_agent_uses_plain_messages_for_tool_results() -> None:
    explorer = OntologyExplorer(Path("knowledge/ontology"))
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
