from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

LLM_PROVIDERS = ("openai", "huggingface")


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
    ontology_paths: tuple[Path, ...]
    ontology_glob: str
    fuseki_query_endpoint: str
    graphrag_api_base_url: str
    default_llm_provider: str
    openai_model: str
    hf_model: str
    hf_base_url: str
    max_steps: int

    @classmethod
    def from_env(cls) -> "Settings":
        ontology_paths = cls._ontology_paths_from_env()
        ontology_glob = os.getenv("ONTOLOGY_GLOB", "**/*.*")
        fuseki_query_endpoint = os.getenv(
            "FUSEKI_QUERY_ENDPOINT",
            "http://localhost:3030/dataset/query",
        )
        graphrag_api_base_url = os.getenv("GRAPHRAG_API_BASE_URL", "http://localhost:8001")
        default_llm_provider = os.getenv("DEFAULT_LLM_PROVIDER", "openai").strip().lower()
        if default_llm_provider not in LLM_PROVIDERS:
            default_llm_provider = "openai"
        openai_model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
        hf_model = os.getenv("HF_MODEL", "Qwen/Qwen3-4B-Instruct-2507:nscale")
        hf_base_url = os.getenv("HF_BASE_URL", "https://router.huggingface.co/v1")
        max_steps = int(os.getenv("AGENT_MAX_STEPS", "10"))

        return cls(
            ontology_paths=ontology_paths,
            ontology_glob=ontology_glob,
            fuseki_query_endpoint=fuseki_query_endpoint,
            graphrag_api_base_url=graphrag_api_base_url,
            default_llm_provider=default_llm_provider,
            openai_model=openai_model,
            hf_model=hf_model,
            hf_base_url=hf_base_url,
            max_steps=max_steps,
        )

    @staticmethod
    def _ontology_paths_from_env() -> tuple[Path, ...]:
        raw_paths = os.getenv("ONTOLOGY_PATHS")
        if raw_paths:
            candidates = [item.strip() for item in raw_paths.split(",")]
        else:
            legacy_path = os.getenv("ONTOLOGY_PATH")
            if legacy_path:
                candidates = [legacy_path.strip()]
            else:
                candidates = ["knowledge/ontology", "knowledge/data"]

        paths: list[Path] = []
        seen: set[Path] = set()
        for candidate in candidates:
            if not candidate:
                continue
            path = Path(candidate).expanduser()
            if path in seen:
                continue
            seen.add(path)
            paths.append(path)

        return tuple(paths)

    def ontology_exists(self) -> bool:
        return any(path.exists() and path.is_dir() for path in self.ontology_paths)

    def is_llm_provider_configured(self, provider: str) -> bool:
        if provider == "openai":
            return bool(os.getenv("OPENAI_API_KEY"))
        if provider == "huggingface":
            return bool(os.getenv("HF_TOKEN"))
        return False


load_dotenv_if_present()
