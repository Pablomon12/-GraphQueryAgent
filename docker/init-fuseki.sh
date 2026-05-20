#!/bin/sh
set -eu

FUSEKI_BASE_URL="${FUSEKI_BASE_URL:-http://fuseki:3030}"
DATASET_NAME="${FUSEKI_DATASET:-dataset}"
ONTOLOGY_GRAPH="${FUSEKI_ONTOLOGY_GRAPH:-http://example.org/graph/ontology}"
DATA_GRAPH="${FUSEKI_DATA_GRAPH:-http://example.org/graph/data}"
FUSEKI_USERNAME="${FUSEKI_USERNAME:-admin}"
FUSEKI_PASSWORD="${FUSEKI_PASSWORD:-admin}"

curl_fuseki() {
  if [ -n "$FUSEKI_PASSWORD" ]; then
    curl -fsS -u "${FUSEKI_USERNAME}:${FUSEKI_PASSWORD}" "$@"
  else
    curl -fsS "$@"
  fi
}

wait_for_fuseki() {
  attempts=0
  until curl_fuseki "${FUSEKI_BASE_URL}/$/ping" >/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 30 ]; then
      echo "Fuseki did not become ready in time" >&2
      exit 1
    fi
    sleep 2
  done
}

wait_for_dataset() {
  attempts=0
  until curl_fuseki "${FUSEKI_BASE_URL}/\$/datasets/${DATASET_NAME}" >/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 30 ]; then
      echo "Fuseki dataset ${DATASET_NAME} did not become ready in time" >&2
      exit 1
    fi
    sleep 2
  done
}

upload_dir() {
  dir_path="$1"
  graph_uri="$2"

  if [ ! -d "$dir_path" ]; then
    return 0
  fi

  find "$dir_path" -type f | while IFS= read -r file_path; do
    case "$file_path" in
      *.ttl) content_type="text/turtle" ;;
      *.nt) content_type="application/n-triples" ;;
      *.rdf|*.owl|*.xml) content_type="application/rdf+xml" ;;
      *)
        continue
        ;;
    esac

    curl_fuseki \
      -X POST \
      --data-binary "@${file_path}" \
      -H "Content-Type: ${content_type}" \
      --url-query "graph=${graph_uri}" \
      "${FUSEKI_BASE_URL}/${DATASET_NAME}/data"
  done
}

wait_for_fuseki
wait_for_dataset

curl_fuseki -X POST "${FUSEKI_BASE_URL}/${DATASET_NAME}/update" \
  -H "Content-Type: application/sparql-update" \
  --data "CLEAR SILENT GRAPH <${ONTOLOGY_GRAPH}>; CLEAR SILENT GRAPH <${DATA_GRAPH}>;" >/dev/null

upload_dir "/bootstrap/ontology" "${ONTOLOGY_GRAPH}"
upload_dir "/bootstrap/data" "${DATA_GRAPH}"
