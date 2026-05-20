from __future__ import annotations

import os
from typing import Any

from openai import OpenAI
from ontology_agent.config import load_dotenv_if_present


class LLMClient:
    def __init__(self, model: str) -> None:
        self.model = model
        self.client: OpenAI | None = None

    def call(self, messages: list[dict[str, Any]]) -> str:
        if self.client is None:
            load_dotenv_if_present()
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY is not configured.")
            self.client = OpenAI(api_key=api_key)

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or "{}"
