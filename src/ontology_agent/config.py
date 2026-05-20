from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def load_dotenv_if_present(path: Path | None = None) -> None:
    env_path = path or Path(".env")
    if not env_path.exists() or not env_path.is_file():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key:
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


@dataclass(frozen=True)
class Settings:
    ontology_path: Path
    ontology_glob: str
    fuseki_query_endpoint: str
    openai_model: str
    max_steps: int

    @classmethod
    def from_env(cls) -> "Settings":
        ontology_path = Path(os.getenv("ONTOLOGY_PATH", "knowledge/ontology")).expanduser()
        ontology_glob = os.getenv("ONTOLOGY_GLOB", "**/*.*")
        fuseki_query_endpoint = os.getenv(
            "FUSEKI_QUERY_ENDPOINT",
            "http://localhost:3030/dataset/query",
        )
        openai_model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
        max_steps = int(os.getenv("AGENT_MAX_STEPS", "10"))

        return cls(
            ontology_path=ontology_path,
            ontology_glob=ontology_glob,
            fuseki_query_endpoint=fuseki_query_endpoint,
            openai_model=openai_model,
            max_steps=max_steps,
        )

    def ontology_exists(self) -> bool:
        return self.ontology_path.exists() and self.ontology_path.is_dir()


load_dotenv_if_present()
