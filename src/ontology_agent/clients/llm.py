from __future__ import annotations

import os
from collections.abc import Iterator
from typing import Any

from openai import OpenAI
from ontology_agent.config import load_dotenv_if_present


class LLMClient:
    def __init__(
        self,
        model: str,
        *,
        provider: str = "openai",
        api_key_env: str = "OPENAI_API_KEY",
        base_url: str | None = None,
    ) -> None:
        self.model = model
        self.provider = provider
        self.api_key_env = api_key_env
        self.base_url = base_url
        self.client: OpenAI | None = None

    def call(self, messages: list[dict[str, Any]]) -> str:
        response = self._create_completion(messages, stream=False)
        return response.choices[0].message.content or "{}"

    def stream(self, messages: list[dict[str, Any]]) -> Iterator[str]:
        response = self._create_completion(messages, stream=True)
        for chunk in response:
            if not chunk.choices:
                continue
            content = chunk.choices[0].delta.content
            if content:
                yield content

    def _create_completion(self, messages: list[dict[str, Any]], *, stream: bool) -> Any:
        if self.client is None:
            load_dotenv_if_present()
            api_key = os.getenv(self.api_key_env)
            if not api_key:
                raise RuntimeError(f"{self.api_key_env} is not configured.")
            self.client = OpenAI(api_key=api_key, base_url=self.base_url)

        return self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0,
            response_format=self._response_format(),
            stream=stream,
        )

    def _response_format(self) -> dict[str, Any]:
        if self.provider == "huggingface":
            return {
                "type": "json_schema",
                "json_schema": {
                    "name": "ontology_agent_response",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "tool": {"type": "string"},
                            "args": {"type": "object"},
                            "final": {"type": "boolean"},
                            "sparql": {"type": ["string", "null"]},
                            "results": {},
                            "answer": {"type": "string"},
                            "phases": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "additionalProperties": True,
                    },
                    "strict": False,
                },
            }

        return {"type": "json_object"}
