from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

from rdflib import OWL, RDF, RDFS, Graph, Literal, URIRef

SUPPORTED_SUFFIXES = {".ttl", ".rdf", ".owl", ".nt", ".xml"}
RDF_FORMATS = {
    ".ttl": "turtle",
    ".rdf": "xml",
    ".owl": "xml",
    ".nt": "nt",
    ".xml": "xml",
}


class OntologyExplorer:
    def __init__(self, ontology_paths: list[Path] | tuple[Path, ...], ontology_glob: str = "**/*.*") -> None:
        self.ontology_paths = tuple(ontology_paths)
        self.ontology_glob = ontology_glob
        self._graph: Graph | None = None

    def list_ontology_files(self) -> list[str]:
        files: list[str] = []
        seen: set[Path] = set()
        for ontology_path in self.ontology_paths:
            if not ontology_path.exists():
                continue
            for path in sorted(ontology_path.glob(self.ontology_glob)):
                if not path.is_file() or path.suffix.lower() not in SUPPORTED_SUFFIXES:
                    continue
                resolved = path.resolve()
                if resolved in seen:
                    continue
                seen.add(resolved)
                files.append(str(path))
        return files

    def ensure_ready(self) -> None:
        files = self.list_ontology_files()
        if not files:
            raise FileNotFoundError(
                "No ontology files found under the configured ontology paths. "
                "Add at least one .ttl/.rdf/.owl file or set ONTOLOGY_PATHS."
            )

    def _load_graph(self) -> Graph:
        if self._graph is not None:
            return self._graph

        self.ensure_ready()
        graph = Graph()
        for file_name in self.list_ontology_files():
            path = Path(file_name)
            rdf_format = RDF_FORMATS.get(path.suffix.lower())
            graph.parse(path, format=rdf_format)

        self._graph = graph
        return graph

    def list_classes(self) -> list[dict[str, Any]]:
        graph = self._load_graph()
        query = """
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT DISTINCT ?class ?label ?comment WHERE {
          ?class a ?type .
          VALUES ?type { owl:Class rdfs:Class }
          OPTIONAL { ?class rdfs:label ?label }
          OPTIONAL { ?class rdfs:comment ?comment }
        }
        ORDER BY ?class
        """
        return [
            {
                "uri": str(row["class"]),
                "qname": self._qname(graph, row["class"]),
                "label": self._literal_or_none(row["label"]),
                "comment": self._literal_or_none(row["comment"]),
            }
            for row in graph.query(query)
        ]

    def list_properties(self) -> list[dict[str, Any]]:
        graph = self._load_graph()
        query = """
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT DISTINCT ?property ?label ?comment ?domain ?range WHERE {
          ?property a ?type .
          VALUES ?type { rdf:Property owl:ObjectProperty owl:DatatypeProperty }
          OPTIONAL { ?property rdfs:label ?label }
          OPTIONAL { ?property rdfs:comment ?comment }
          OPTIONAL { ?property rdfs:domain ?domain }
          OPTIONAL { ?property rdfs:range ?range }
        }
        ORDER BY ?property
        """
        return [
            {
                "uri": str(row["property"]),
                "qname": self._qname(graph, row["property"]),
                "label": self._literal_or_none(row["label"]),
                "comment": self._literal_or_none(row["comment"]),
                "domain": str(row["domain"]) if row["domain"] else None,
                "domain_qname": self._qname(graph, row["domain"]) if row["domain"] else None,
                "range": str(row["range"]) if row["range"] else None,
                "range_qname": self._qname(graph, row["range"]) if row["range"] else None,
            }
            for row in graph.query(query)
        ]

    def list_prefixes(self) -> list[dict[str, str]]:
        graph = self._load_graph()
        prefixes = []
        for prefix, namespace in sorted(graph.namespaces(), key=lambda item: item[0]):
            prefixes.append({"prefix": prefix, "namespace": str(namespace)})
        return prefixes

    def list_individuals(self, class_uri: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
        graph = self._load_graph()
        if limit <= 0:
            return []

        subjects: set[URIRef] = set()
        class_ref = URIRef(class_uri) if class_uri else None

        for subject in graph.subjects(RDF.type, None):
            if not isinstance(subject, URIRef):
                continue
            if class_ref and (subject, RDF.type, class_ref) not in graph:
                continue
            subjects.add(subject)

        individuals: list[dict[str, Any]] = []
        for subject in sorted(subjects, key=str)[:limit]:
            types = [obj for obj in graph.objects(subject, RDF.type)]
            individuals.append(
                {
                    "uri": str(subject),
                    "qname": self._qname(graph, subject),
                    "label": self._first_literal(graph.objects(subject, RDFS.label)),
                    "types": [str(obj) for obj in types],
                    "type_qnames": [self._qname(graph, obj) for obj in types],
                }
            )

        return individuals

    def get_schema_summary(self, limit: int = 10) -> dict[str, Any]:
        classes = self.list_classes()[:limit]
        properties = self.list_properties()[:limit]
        class_uris = [item["uri"] for item in classes[:3]]

        return {
            "files": self.list_ontology_files(),
            "prefixes": self.list_prefixes(),
            "class_count": len(self.list_classes()),
            "property_count": len(self.list_properties()),
            "classes": classes,
            "properties": properties,
            "sample_individuals": {
                class_uri: self.list_individuals(class_uri=class_uri, limit=5)
                for class_uri in class_uris
            },
        }

    def describe_resource(self, uri: str) -> dict[str, Any]:
        graph = self._load_graph()
        resource = URIRef(uri)

        outgoing = [
            {
                "predicate": str(predicate),
                "predicate_qname": self._qname(graph, predicate),
                "object": str(obj),
                "object_qname": self._qname(graph, obj) if isinstance(obj, URIRef) else None,
            }
            for predicate, obj in graph.predicate_objects(resource)
        ]
        incoming = [
            {
                "subject": str(subject),
                "subject_qname": self._qname(graph, subject) if isinstance(subject, URIRef) else None,
                "predicate": str(predicate),
                "predicate_qname": self._qname(graph, predicate),
            }
            for subject, predicate in graph.subject_predicates(resource)
        ]

        rdf_types = [obj for obj in graph.objects(resource, RDF.type)]
        return {
            "uri": uri,
            "qname": self._qname(graph, resource),
            "types": [str(obj) for obj in rdf_types],
            "type_qnames": [self._qname(graph, obj) for obj in rdf_types],
            "outgoing": outgoing,
            "incoming": incoming,
        }

    def search_ontology(self, term: str, limit: int = 20) -> list[dict[str, Any]]:
        graph = self._load_graph()
        needle = term.strip().lower()
        if not needle:
            return []

        matches: list[dict[str, Any]] = []
        seen: set[str] = set()

        for subject in sorted(set(graph.subjects()), key=str):
            if not isinstance(subject, URIRef):
                continue

            values = {
                "uri": str(subject),
                "qname": self._qname(graph, subject),
                "label": self._first_literal(graph.objects(subject, RDFS.label)),
                "comment": self._first_literal(graph.objects(subject, RDFS.comment)),
                "types": sorted(str(obj) for obj in graph.objects(subject, RDF.type)),
            }
            object_values = sorted(str(obj) for _, _, obj in graph.triples((subject, None, None)))
            predicate_values = sorted(str(pred) for _, pred, _ in graph.triples((subject, None, None)))

            haystacks = [
                values["uri"],
                values["qname"] or "",
                values["label"] or "",
                values["comment"] or "",
                " ".join(values["types"]),
                " ".join(predicate_values),
                " ".join(object_values),
            ]
            if any(needle in field.lower() for field in haystacks):
                if values["uri"] in seen:
                    continue
                matches.append(values)
                seen.add(values["uri"])
                if len(matches) >= limit:
                    break

        return matches

    def get_usage_examples(self, property_uri: str, limit: int = 10) -> list[dict[str, str]]:
        graph = self._load_graph()
        predicate = URIRef(property_uri)
        examples = []
        for subject, _, obj in graph.triples((None, predicate, None)):
            examples.append(
                {
                    "subject": str(subject),
                    "subject_qname": self._qname(graph, subject) if isinstance(subject, URIRef) else None,
                    "object": str(obj),
                    "object_qname": self._qname(graph, obj) if isinstance(obj, URIRef) else None,
                }
            )
            if len(examples) >= limit:
                break
        return examples

    def get_class_profile(self, class_uri: str) -> dict[str, Any]:
        graph = self._load_graph()
        class_ref = URIRef(class_uri)
        instances = list(graph.subjects(RDF.type, class_ref))
        property_counter: Counter[str] = Counter()

        for instance in instances:
            for predicate, _ in graph.predicate_objects(instance):
                property_counter[str(predicate)] += 1

        return {
            "class_uri": class_uri,
            "class_qname": self._qname(graph, class_ref),
            "instance_count": len({str(item) for item in instances}),
            "top_properties": [
                {
                    "uri": uri,
                    "qname": self._qname(graph, URIRef(uri)),
                    "usage_count": count,
                }
                for uri, count in property_counter.most_common(10)
            ],
            "sample_individuals": self.list_individuals(class_uri=class_uri, limit=5),
        }

    @staticmethod
    def _literal_or_none(value: Any) -> str | None:
        if value is None:
            return None
        return str(value)

    @staticmethod
    def _first_literal(values: Any) -> str | None:
        for value in values:
            if isinstance(value, Literal):
                return str(value)
            return str(value)
        return None

    @staticmethod
    def _qname(graph: Graph, value: Any) -> str | None:
        if value is None or not isinstance(value, URIRef):
            return None
        try:
            return graph.qname(value)
        except Exception:
            return None
