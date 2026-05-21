from __future__ import annotations

import os
from collections.abc import Iterator
from typing import Any

from openai import OpenAI
from ontology_agent.config import load_dotenv_if_present


class LLMClient:
    def __init__(self, model: str) -> None:
        self.model = model
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
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY is not configured.")
            self.client = OpenAI(api_key=api_key)

        return self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0,
            response_format={"type": "json_object"},
            stream=stream,
        )
