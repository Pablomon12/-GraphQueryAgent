from __future__ import annotations

import argparse
import csv
import json
import math
import random
import re
import time
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


SYSTEMS = ("semantic_agent", "base_model", "graph_rag")
ENDPOINTS = {
    "semantic_agent": "/ask",
    "base_model": "/baseline",
    "graph_rag": "/graphrag",
}
CSV_FIELDS = [
    "run_id",
    "system",
    "question_id",
    "repetition",
    "model",
    "temperature",
    "started_at",
    "finished_at",
    "latency_ms",
    "steps",
    "answer",
    "sparql_present",
    "results_present",
    "exact_accuracy",
    "precision",
    "recall",
    "f1",
    "completeness",
    "hallucination_count",
    "traceability",
    "status",
    "http_status",
    "raw_file",
    "error",
    "notes",
]


@dataclass(frozen=True)
class Job:
    run_id: int
    system: str
    question_id: str
    question: str
    repetition: int
    expected: dict[str, Any]
    test_type: str


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def normalize_text(value: Any) -> str:
    text = str(value)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.upper()
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def request_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    timeout: float,
) -> tuple[int, dict[str, Any]]:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            status = int(response.status)
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed_error = json.loads(body)
        except json.JSONDecodeError:
            parsed_error = {"detail": body}
        return int(exc.code), {"error": parsed_error}
    except URLError as exc:
        raise RuntimeError(str(exc.reason)) from exc

    if not body:
        return status, {}

    parsed = json.loads(body)
    if not isinstance(parsed, dict):
        raise RuntimeError("Response must be a JSON object")
    return status, parsed


def sparql_bindings(payload: dict[str, Any]) -> list[dict[str, str]]:
    results = payload.get("results")
    if not isinstance(results, dict):
        return []
    bindings = results.get("results", {}).get("bindings", [])
    if not isinstance(bindings, list):
        return []

    rows: list[dict[str, str]] = []
    for binding in bindings:
        if not isinstance(binding, dict):
            continue
        row: dict[str, str] = {}
        for key, value in binding.items():
            if isinstance(value, dict) and "value" in value:
                row[key] = str(value["value"])
        rows.append(row)
    return rows


def collect_text(payload: dict[str, Any]) -> str:
    chunks: list[str] = []
    answer = payload.get("answer")
    if answer:
        chunks.append(str(answer))
    results = payload.get("results")
    if results is not None:
        chunks.append(json.dumps(results, ensure_ascii=False))
    sparql = payload.get("sparql")
    if sparql:
        chunks.append(str(sparql))
    return "\n".join(chunks)


def score_categories(expected: dict[str, int], payload: dict[str, Any]) -> dict[str, float]:
    found: dict[str, int] = {}
    for row in sparql_bindings(payload):
        label = row.get("type")
        count = row.get("n") or row.get("count") or row.get("countDrugs")
        if label is None or count is None:
            continue
        try:
            found[label] = int(count)
        except ValueError:
            continue

    text = collect_text(payload)
    normalized = normalize_text(text)
    for label, count in expected.items():
        if label in found:
            continue
        label_pattern = re.escape(normalize_text(label))
        if re.search(rf"{label_pattern}\D{{0,80}}{count}\b", normalized):
            found[label] = count

    correct = sum(1 for label, count in expected.items() if found.get(label) == count)
    completeness = correct / len(expected) if expected else 0.0
    exact = 1.0 if correct == len(expected) and len(found) == len(expected) else 0.0
    return metric_block(exact, completeness, completeness, completeness, 0.0)


def score_count(expected_count: int, payload: dict[str, Any]) -> dict[str, float]:
    for row in sparql_bindings(payload):
        for key in ("n", "count", "countDrugs"):
            if key in row:
                try:
                    value = int(row[key])
                except ValueError:
                    continue
                exact = 1.0 if value == expected_count else 0.0
                return metric_block(exact, exact, exact, exact, 0.0)

    text = collect_text(payload)
    exact = 1.0 if re.search(rf"\b{expected_count}\b", text) else 0.0
    return metric_block(exact, exact, exact, exact, 0.0)


def score_fields(expected: dict[str, Any], payload: dict[str, Any]) -> dict[str, float]:
    values = []
    for key in ("drug", "mechanism", "target", "approved_symbol"):
        value = expected.get(key)
        if value and normalize_text(value) not in [normalize_text(item) for item in values]:
            values.append(str(value))

    text = normalize_text(collect_text(payload))
    matched = sum(1 for value in values if normalize_text(value) in text)
    completeness = matched / len(values) if values else 0.0
    exact = 1.0 if completeness == 1.0 else 0.0
    return metric_block(exact, completeness, completeness, completeness, 0.0)


def extract_uppercase_entities(answer: str) -> list[str]:
    candidates = re.findall(
        r"\b[A-ZÁÉÍÓÚÑ0-9-]{3,}(?:\s+[A-ZÁÉÍÓÚÑ0-9-]{3,})*\b",
        answer,
    )
    ignored = {
        "EGFR",
        "JSON",
        "SPARQL",
        "RDF",
        "OWL",
        "LLM",
        "API",
        "GRAPH",
        "TARGET",
        "SELECT",
        "WHERE",
        "PREFIX",
    }
    normalized = []
    for candidate in candidates:
        entity = normalize_text(candidate)
        if entity not in ignored:
            normalized.append(entity)
    return sorted(set(normalized))


def score_entities(expected_entities: list[str], payload: dict[str, Any]) -> dict[str, float]:
    expected = [normalize_text(item) for item in expected_entities]
    text = normalize_text(collect_text(payload))
    returned = [entity for entity in expected if entity in text]
    extracted = extract_uppercase_entities(str(payload.get("answer", "")))
    returned_total = max(len(extracted), len(returned))
    precision = len(returned) / returned_total if returned_total else 0.0
    recall = len(returned) / len(expected) if expected else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    hallucinations = len([entity for entity in extracted if entity not in expected])
    exact = 1.0 if len(returned) == len(expected) and hallucinations == 0 else 0.0
    return metric_block(exact, precision, recall, f1, float(hallucinations), completeness=recall)


def metric_block(
    exact: float,
    precision: float,
    recall: float,
    f1: float,
    hallucinations: float,
    *,
    completeness: float | None = None,
) -> dict[str, float]:
    return {
        "exact_accuracy": exact,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "completeness": recall if completeness is None else completeness,
        "hallucination_count": hallucinations,
    }


def score_payload(job: Job, payload: dict[str, Any], *, ok: bool) -> dict[str, float | str]:
    if not ok:
        return {
            **metric_block(0.0, 0.0, 0.0, 0.0, 0.0),
            "traceability": 0.0,
            "status": "unanswered",
        }

    if job.test_type == "category_distribution":
        metrics = score_categories(job.expected, payload)
    elif job.test_type == "numeric_count":
        metrics = score_count(int(job.expected["count"]), payload)
    elif job.test_type == "entity_attribute_extraction":
        metrics = score_fields(job.expected, payload)
    elif job.test_type == "entity_set_retrieval":
        metrics = score_entities(list(job.expected["entities"]), payload)
    else:
        metrics = metric_block(0.0, 0.0, 0.0, 0.0, 0.0)

    traceability = 0.0
    if job.system == "semantic_agent":
        traceability = 1.0 if payload.get("sparql") and payload.get("results") is not None else 0.0
    elif job.system == "graph_rag":
        traceability = 1.0 if payload.get("results") is not None else 0.0

    if metrics["exact_accuracy"] == 1.0 and metrics["hallucination_count"] == 0:
        status = "correct"
    elif metrics["hallucination_count"] > 0:
        status = "hallucinated"
    elif metrics["completeness"] > 0:
        status = "partial"
    else:
        status = "incorrect"

    return {**metrics, "traceability": traceability, "status": status}


def build_jobs(spec: dict[str, Any], *, repetitions: int, seed: int) -> list[Job]:
    jobs: list[Job] = []
    rng = random.Random(seed)
    run_id = 1
    questions = spec["questions"]
    for repetition in range(1, repetitions + 1):
        for item in questions:
            systems = list(SYSTEMS)
            rng.shuffle(systems)
            for system in systems:
                jobs.append(
                    Job(
                        run_id=run_id,
                        system=system,
                        question_id=str(item["id"]),
                        question=str(item["question"]),
                        repetition=repetition,
                        expected=dict(item["expected"]),
                        test_type=str(item["test_type"]),
                    )
                )
                run_id += 1
    return jobs


def average(values: list[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    metrics = [
        "exact_accuracy",
        "precision",
        "recall",
        "f1",
        "completeness",
        "hallucination_count",
        "traceability",
        "latency_ms",
        "steps",
    ]
    summary: dict[str, Any] = {"by_system": {}, "by_question_system": {}}

    by_system: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_question_system: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_system[str(row["system"])].append(row)
        by_question_system[(str(row["question_id"]), str(row["system"]))].append(row)

    for system, system_rows in by_system.items():
        summary["by_system"][system] = aggregate_rows(system_rows, metrics)

    for (question_id, system), group_rows in by_question_system.items():
        summary["by_question_system"][f"{question_id}:{system}"] = {
            "question_id": question_id,
            "system": system,
            **aggregate_rows(group_rows, metrics),
        }

    return summary


def aggregate_rows(rows: list[dict[str, Any]], metrics: list[str]) -> dict[str, Any]:
    aggregate: dict[str, Any] = {"runs": len(rows)}
    for metric in metrics:
        values = [float(row[metric]) for row in rows if row.get(metric) not in ("", None)]
        aggregate[metric] = round(average(values), 4)
    aggregate["failures"] = sum(1 for row in rows if row.get("status") == "unanswered")
    return aggregate


def write_summary_csv(path: Path, summary: dict[str, Any]) -> None:
    fields = [
        "scope",
        "question_id",
        "system",
        "runs",
        "exact_accuracy",
        "precision",
        "recall",
        "f1",
        "completeness",
        "hallucination_count",
        "traceability",
        "latency_ms",
        "steps",
        "failures",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for system, aggregate in summary["by_system"].items():
            writer.writerow({"scope": "system", "question_id": "", "system": system, **aggregate})
        for aggregate in summary["by_question_system"].values():
            writer.writerow({"scope": "question_system", **aggregate})


def run_job(
    job: Job,
    *,
    base_url: str,
    timeout: float,
    raw_dir: Path,
    model: str,
) -> dict[str, Any]:
    endpoint = ENDPOINTS[job.system]
    started_at = utc_now()
    start = time.perf_counter()
    http_status = 0
    payload: dict[str, Any] = {}
    error = ""
    try:
        http_status, payload = request_json(
            f"{base_url.rstrip('/')}{endpoint}",
            method="POST",
            payload={"question": job.question},
            timeout=timeout,
        )
        ok = 200 <= http_status < 300 and "error" not in payload
    except Exception as exc:
        ok = False
        error = str(exc)
        payload = {"error": error}

    latency_ms = int(round((time.perf_counter() - start) * 1000))
    finished_at = utc_now()
    raw_file = raw_dir / f"{job.run_id:03d}_{job.system}_{job.question_id}_r{job.repetition}.json"
    raw_payload = {
        "run_id": job.run_id,
        "system": job.system,
        "question_id": job.question_id,
        "repetition": job.repetition,
        "question": job.question,
        "started_at": started_at,
        "finished_at": finished_at,
        "latency_ms": latency_ms,
        "http_status": http_status,
        "ok": ok,
        "payload": payload,
        "error": error,
    }
    raw_file.write_text(json.dumps(raw_payload, indent=2, ensure_ascii=False), encoding="utf-8")

    scores = score_payload(job, payload, ok=ok)
    notes = ""
    if not ok and not error:
        error = json.dumps(payload.get("error", payload), ensure_ascii=False)
    if job.system == "graph_rag" and ok:
        notes = "Evidence is retrieved context, not a formal SPARQL answer."
    elif job.system == "base_model":
        notes = "No external context by design."

    return {
        "run_id": job.run_id,
        "system": job.system,
        "question_id": job.question_id,
        "repetition": job.repetition,
        "model": model,
        "temperature": 0,
        "started_at": started_at,
        "finished_at": finished_at,
        "latency_ms": latency_ms,
        "steps": payload.get("steps", 1) if ok else 0,
        "answer": str(payload.get("answer", "")) if ok else "",
        "sparql_present": 1 if payload.get("sparql") else 0,
        "results_present": 1 if payload.get("results") is not None else 0,
        "exact_accuracy": scores["exact_accuracy"],
        "precision": scores["precision"],
        "recall": scores["recall"],
        "f1": scores["f1"],
        "completeness": scores["completeness"],
        "hallucination_count": scores["hallucination_count"],
        "traceability": scores["traceability"],
        "status": scores["status"],
        "http_status": http_status,
        "raw_file": str(raw_file.relative_to(raw_dir.parent)),
        "error": error,
        "notes": notes,
    }


def preflight(base_url: str, graph_health_url: str, timeout: float) -> dict[str, Any]:
    base_status, base_health = request_json(f"{base_url.rstrip('/')}/health", timeout=timeout)
    graph_status, graph_health = request_json(graph_health_url, timeout=timeout)
    errors: list[str] = []
    if base_status != 200:
        errors.append(f"Backend health returned HTTP {base_status}")
    if not base_health.get("ontology_ready"):
        errors.append("Backend ontology_ready is false")
    if graph_status != 200:
        errors.append(f"GraphRAG health returned HTTP {graph_status}")
    if graph_health.get("status") != "ok":
        errors.append("GraphRAG status is not ok")
    if errors:
        raise RuntimeError("; ".join(errors))
    return {"backend": base_health, "graphrag": graph_health}


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the semantic vs baseline vs GraphRAG experiment.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--graphrag-health-url", default="http://127.0.0.1:8001/health")
    parser.add_argument("--timeout", type=float, default=180.0)
    parser.add_argument("--seed", type=int, default=20260820)
    parser.add_argument("--repetitions", type=int, default=None)
    parser.add_argument("--smoke", action="store_true", help="Run one balanced block only.")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    spec_path = root / "questions.json"
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    repetitions = int(args.repetitions or spec.get("repetitions_per_question_per_system", 3))

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_root = root / "runs" / (f"{timestamp}_smoke" if args.smoke else timestamp)
    raw_dir = run_root / "raw"
    raw_dir.mkdir(parents=True, exist_ok=False)

    preflight_result = preflight(args.base_url, args.graphrag_health_url, args.timeout)
    jobs = build_jobs(spec, repetitions=repetitions, seed=args.seed)
    if args.smoke:
        first_question = spec["questions"][0]["id"]
        jobs = [job for job in jobs if job.repetition == 1 and job.question_id == first_question]
        for index, job in enumerate(jobs, start=1):
            jobs[index - 1] = Job(
                run_id=index,
                system=job.system,
                question_id=job.question_id,
                question=job.question,
                repetition=job.repetition,
                expected=job.expected,
                test_type=job.test_type,
            )

    manifest = {
        "experiment_id": spec.get("experiment_id"),
        "description": spec.get("description"),
        "started_at": utc_now(),
        "base_url": args.base_url,
        "graphrag_health_url": args.graphrag_health_url,
        "seed": args.seed,
        "order_strategy": "repetition_question_seeded_system_shuffle",
        "repetitions": repetitions,
        "smoke": args.smoke,
        "planned_runs": len(jobs),
        "preflight": preflight_result,
    }
    (run_root / "run_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    rows: list[dict[str, Any]] = []
    for job in jobs:
        print(f"[{job.run_id:03d}/{len(jobs):03d}] {job.system} {job.question_id} r{job.repetition}", flush=True)
        rows.append(
            run_job(
                job,
                base_url=args.base_url,
                timeout=args.timeout,
                raw_dir=raw_dir,
                model=str(preflight_result["backend"].get("openai_model", "")),
            )
        )

    with (run_root / "results.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    summary = summarize(rows)
    summary["manifest"] = {
        "run_dir": str(run_root),
        "total_runs": len(rows),
        "completed_at": utc_now(),
        "raw_files": len(list(raw_dir.glob("*.json"))),
    }
    (run_root / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    write_summary_csv(run_root / "summary.csv", summary)

    manifest["completed_at"] = summary["manifest"]["completed_at"]
    manifest["actual_runs"] = len(rows)
    manifest["raw_files"] = summary["manifest"]["raw_files"]
    (run_root / "run_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    if len(rows) != len(jobs) or summary["manifest"]["raw_files"] != len(jobs):
        raise RuntimeError("Run artifact validation failed")
    if any(row["question_id"] == "" or row["system"] == "" or row["latency_ms"] == "" or row["status"] == "" for row in rows):
        raise RuntimeError("Results CSV contains incomplete rows")

    print(f"Artifacts written to {run_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
