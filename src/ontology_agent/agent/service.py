from __future__ import annotations

import json
from typing import Any

from ontology_agent.agent.prompts import SYSTEM_PROMPT
from ontology_agent.clients.llm import LLMClient
from ontology_agent.clients.sparql import SparqlClient, validate_sparql_readonly
from ontology_agent.ontology import OntologyExplorer


class OntologyAgent:
    def __init__(
        self,
        llm_client: LLMClient,
        ontology_explorer: OntologyExplorer,
        sparql_client: SparqlClient,
        max_steps: int = 10,
    ) -> None:
        self.llm_client = llm_client
        self.ontology_explorer = ontology_explorer
        self.sparql_client = sparql_client
        self.max_steps = max_steps
        self.tools = {
            "get_schema_summary": self.ontology_explorer.get_schema_summary,
            "list_ontology_files": self.ontology_explorer.list_ontology_files,
            "list_prefixes": self.ontology_explorer.list_prefixes,
            "list_classes": self.ontology_explorer.list_classes,
            "list_properties": self.ontology_explorer.list_properties,
            "list_individuals": self.ontology_explorer.list_individuals,
            "get_class_profile": self.ontology_explorer.get_class_profile,
            "get_usage_examples": self.ontology_explorer.get_usage_examples,
            "search_ontology": self.ontology_explorer.search_ontology,
            "describe_resource": self.ontology_explorer.describe_resource,
            "run_sparql": self._tool_run_sparql,
        }

    def ask(self, question: str) -> dict[str, Any]:
        self.ontology_explorer.ensure_ready()

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "User question: "
                    f"{question}\n"
                    "Explore the ontology before building SPARQL."
                ),
            },
        ]

        for step in range(self.max_steps):
            raw_response = self.llm_client.call(messages)

            try:
                response = self._parse_json(raw_response)
            except ValueError:
                messages.extend(
                    [
                        {"role": "assistant", "content": raw_response},
                        {
                            "role": "user",
                            "content": (
                                "Your previous answer was not valid JSON. "
                                "Reply only with valid JSON."
                            ),
                        },
                    ]
                )
                continue

            if response.get("final") is True:
                return {
                    "question": question,
                    "sparql": response.get("sparql"),
                    "results": response.get("results"),
                    "answer": response.get("answer", ""),
                    "phases": response.get("phases", []),
                    "steps": step + 1,
                }

            tool_name = response.get("tool")
            args = response.get("args", {})
            tool = self.tools.get(tool_name)

            if tool is None:
                tool_result: dict[str, Any] = {
                    "error": f"Unknown tool '{tool_name}'",
                    "available_tools": sorted(self.tools.keys()),
                }
            else:
                try:
                    tool_result = tool(**args)
                except Exception as exc:
                    tool_result = {"error": str(exc), "tool": tool_name}

            messages.extend(
                [
                    {
                        "role": "assistant",
                        "content": json.dumps(response, ensure_ascii=False),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Tool result for '{tool_name}':\n"
                            f"{json.dumps(tool_result, ensure_ascii=False)}\n\n"
                            "Continue from this result. "
                            "Reply only with valid JSON."
                        ),
                    },
                ]
            )

        return {
            "question": question,
            "sparql": None,
            "results": None,
            "answer": "The agent could not finish within the configured step limit.",
            "phases": [],
            "steps": self.max_steps,
        }

    @staticmethod
    def _parse_json(text: str) -> dict[str, Any]:
        text = text.strip()
        if text.startswith("```json"):
            text = text.removeprefix("```json").removesuffix("```").strip()
        elif text.startswith("```"):
            text = text.removeprefix("```").removesuffix("```").strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError("Invalid JSON") from exc

    def _tool_run_sparql(self, query: str) -> Any:
        validate_sparql_readonly(query)
        return self.sparql_client.run_query(query)
