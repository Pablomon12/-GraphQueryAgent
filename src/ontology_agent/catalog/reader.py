from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class SemanticCatalogReader:
    """Read-only access to the persisted semantic catalog."""

    SECTION_FILES = {
        "overview": "overview.md",
        "schema": "schema.md",
        "query_patterns": "query_patterns.md",
        "entity_indexes": "entity_indexes.md",
        "json": "catalog.json",
    }

    def __init__(self, catalog_dir: Path | str = Path("knowledge/catalog")) -> None:
        self.catalog_dir = Path(catalog_dir)

    def read(self, section: str | None = None) -> dict[str, Any]:
        section_name = section or "overview"
        file_name = self.SECTION_FILES.get(section_name)
        if file_name is None:
            raise ValueError(
                "Unknown semantic catalog section. "
                f"Available sections: {', '.join(sorted(self.SECTION_FILES))}."
            )

        path = (self.catalog_dir / file_name).resolve()
        catalog_root = self.catalog_dir.resolve()
        if catalog_root not in path.parents:
            raise ValueError("Semantic catalog access is restricted to the catalog directory.")
        if not path.is_file():
            raise FileNotFoundError(f"Semantic catalog section not found: {section_name}")

        content = path.read_text(encoding="utf-8")
        if section_name == "json":
            return {
                "section": section_name,
                "path": str(path),
                "content": json.loads(content),
            }

        return {
            "section": section_name,
            "path": str(path),
            "content": content,
        }
