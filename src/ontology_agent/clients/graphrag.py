from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class GraphRAGClient:
    def __init__(self, *, base_url: str, timeout: float = 120.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def ask(self, question: str, *, top_k: int = 5) -> dict[str, Any]:
        payload = json.dumps(
            {
                "question": question,
                "top_k": top_k,
            }
        ).encode("utf-8")
        request = Request(
            f"{self.base_url}/ask",
            data=payload,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=self.timeout) as response:
                body = response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"GraphRAG request failed with HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise RuntimeError(f"GraphRAG request failed: {exc.reason}") from exc

        if not body:
            raise RuntimeError("GraphRAG returned an empty response")

        parsed = json.loads(body)
        if not isinstance(parsed, dict):
            raise RuntimeError("GraphRAG response must be a JSON object")

        return parsed
