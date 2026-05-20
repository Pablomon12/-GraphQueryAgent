from __future__ import annotations

from typing import Any

from SPARQLWrapper import JSON, SPARQLWrapper


ALLOWED_STARTS = ("select", "ask", "construct", "describe", "prefix", "base")
FORBIDDEN_KEYWORDS = (
    "insert",
    "delete",
    "drop",
    "clear",
    "create",
    "load",
    "copy",
    "move",
    "add",
)


def validate_sparql_readonly(query: str) -> None:
    normalized = query.strip().lower()
    if not normalized.startswith(ALLOWED_STARTS):
        raise ValueError("Only read-only SPARQL queries are allowed.")

    for keyword in FORBIDDEN_KEYWORDS:
        if keyword in normalized:
            raise ValueError(f"Forbidden SPARQL keyword detected: {keyword}")


class SparqlClient:
    def __init__(self, query_endpoint: str) -> None:
        self.query_endpoint = query_endpoint

    def run_query(self, query: str) -> Any:
        validate_sparql_readonly(query)

        sparql = SPARQLWrapper(self.query_endpoint)
        sparql.setQuery(query)
        sparql.setReturnFormat(JSON)
        return sparql.query().convert()
