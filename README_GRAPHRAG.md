# Farmacos GraphRAG

GraphRAG sobre `farmacos_aprobados.csv` usando Neo4j, FastAPI, OpenAI y el paquete oficial `neo4j-graphrag`. El objetivo es responder preguntas del dominio solo con evidencia recuperada del grafo cargado.

Repositorio upstream del paquete oficial usado por esta arquitectura: `https://github.com/neo4j/neo4j-graphrag-python`.

## Por que esta arquitectura

El CSV contiene fármacos, marcas, tipos, indicaciones, dianas, símbolos aprobados, clases de diana y mecanismos de acción. Muchos campos son multivalor, por lo que cargar cada fila como texto plano perdería relaciones importantes.

Neo4j modela esas conexiones de forma explícita y permite devolver evidencia trazable por fila. OpenAI se usa para embeddings y redacción final, orquestado por `neo4j-graphrag` en la fase de pregunta. La respuesta se genera únicamente con el contexto recuperado desde Neo4j. Si no hay evidencia, la API debe abstenerse.

## Estructura

- `app/csv_parser.py`: parsea y normaliza `farmacos_aprobados.csv`.
- `app/neo4j_store.py`: crea constraints, índice vectorial e ingesta idempotente.
- `app/graph_rag.py`: configura `VectorCypherRetriever` y `GraphRAG` oficiales para recuperar evidencia y generar respuestas.
- `app/main.py`: API FastAPI.
- `scripts/ingest.py`: ingesta por CLI.
- `tests/`: pruebas de parsing y abstención.

## Configuracion

Crear `.env` desde `.env.example`:

```bash
cp .env.example .env
```

Editar al menos:

```bash
OPENAI_API_KEY=sk-...
NEO4J_PASSWORD=change-me-please
```

## Ejecucion con Docker

Crear `.env` desde `.env.example` y ajustar `OPENAI_API_KEY` y `NEO4J_PASSWORD`.

```bash
docker compose up --build
```

La API queda en `http://localhost:8000` y Neo4j Browser en `http://localhost:7474`. Antes de arrancar la API, Compose ejecuta una ingesta automatica del CSV. Si Neo4j ya contiene documentos cargados, la ingesta se salta y no recalcula embeddings.

La carga manual por HTTP sigue disponible si se necesita reingerir despues de cambiar el CSV:

```bash
curl -X POST http://localhost:8000/ingest
```

Preguntar:

```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Que dianas tiene ABATACEPT?","top_k":5}'
```

Tambien se puede forzar una carga por CLI dentro de Docker:

```bash
docker compose run --rm ingest python -m scripts.ingest
```

## Uso desde otro repositorio

El otro repositorio no necesita tener Neo4j instalado ni incluir el codigo fuente de esta API. Solo necesita Docker, el CSV, un `.env` y el archivo `docker-compose.external.yml`.

### 1. Construir la imagen de la API

Desde este repo, construir la imagen Docker:

```bash
docker compose build api
```

Esto crea la imagen local `farmacos-graphrag-api:latest`. Si se va a usar en otra maquina, subir esa imagen a un registry y cambiar `GRAPHRAG_IMAGE` por el nombre publicado.

### 2. Copiar los archivos al otro repo

En el otro repo, copiar:

- `docker-compose.external.yml`
- `farmacos_aprobados.csv`, o montar otro CSV compatible

Crear tambien un `.env` en el otro repo:

```bash
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

NEO4J_USER=neo4j
NEO4J_PASSWORD=change-me-please
NEO4J_DATABASE=neo4j

HOST_CSV_PATH=./ruta/al/farmacos_aprobados.csv
CSV_PATH=/data/farmacos_aprobados.csv
GRAPHRAG_IMAGE=farmacos-graphrag-api:latest
API_PORT=8000
NEO4J_BROWSER_PORT=7474
NEO4J_BOLT_PORT=7687
```

`HOST_CSV_PATH` es la ruta del CSV dentro del otro repo. `CSV_PATH` es la ruta interna dentro del contenedor y normalmente no hay que cambiarla.

### 3. Levantar la API en el otro repo

Desde el otro repo:

```bash
docker compose -f docker-compose.external.yml up -d
```

Ese compose levanta tres servicios:

- `farmacos-neo4j`: base Neo4j incluida, con volumen persistente.
- `farmacos-ingest`: carga el CSV en Neo4j antes de arrancar la API.
- `farmacos-graphrag`: API FastAPI expuesta en `http://localhost:8000`.

La primera vez, `farmacos-ingest` genera embeddings con OpenAI y carga el grafo. En siguientes arranques, si Neo4j ya tiene datos en el volumen `farmacos_neo4j_data`, la ingesta se salta y no recalcula embeddings.

### 4. Comprobar que esta funcionando

Healthcheck:

```bash
curl http://localhost:8000/health
```

Pregunta de ejemplo:

```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"Que dianas tiene ABATACEPT?","top_k":5}'
```

Neo4j Browser queda disponible en `http://localhost:7474` con usuario `neo4j` y la password definida en `NEO4J_PASSWORD`.

### 5. Integrarlo en el compose del otro repo

Si el otro repo ya tiene su propio `docker-compose.yml`, puede usar `docker-compose.external.yml` aparte o pegar estos servicios dentro de su compose:

```yaml
services:
  farmacos-neo4j:
    image: neo4j:5-community
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD:-change-me-please}
    ports:
      - "${NEO4J_BROWSER_PORT:-7474}:7474"
      - "${NEO4J_BOLT_PORT:-7687}:7687"
    volumes:
      - farmacos_neo4j_data:/data
      - farmacos_neo4j_logs:/logs
    healthcheck:
      test: ["CMD-SHELL", "cypher-shell -u neo4j -p ${NEO4J_PASSWORD:-change-me-please} 'RETURN 1'"]
      interval: 10s
      timeout: 10s
      retries: 10

  farmacos-ingest:
    image: ${GRAPHRAG_IMAGE:-farmacos-graphrag-api:latest}
    depends_on:
      farmacos-neo4j:
        condition: service_healthy
    env_file:
      - .env
    environment:
      NEO4J_URI: bolt://farmacos-neo4j:7687
      CSV_PATH: ${CSV_PATH:-/data/farmacos_aprobados.csv}
    volumes:
      - ${HOST_CSV_PATH:-./farmacos_aprobados.csv}:${CSV_PATH:-/data/farmacos_aprobados.csv}:ro
    command: ["python", "-m", "scripts.ingest", "--skip-if-loaded"]

  farmacos-graphrag:
    image: ${GRAPHRAG_IMAGE:-farmacos-graphrag-api:latest}
    depends_on:
      farmacos-ingest:
        condition: service_completed_successfully
    env_file:
      - .env
    environment:
      NEO4J_URI: bolt://farmacos-neo4j:7687
      CSV_PATH: ${CSV_PATH:-/data/farmacos_aprobados.csv}
    ports:
      - "${API_PORT:-8000}:8000"
    volumes:
      - ${HOST_CSV_PATH:-./farmacos_aprobados.csv}:${CSV_PATH:-/data/farmacos_aprobados.csv}:ro

volumes:
  farmacos_neo4j_data:
  farmacos_neo4j_logs:
```

Los servicios del otro repo podran llamar a la API usando el nombre del servicio dentro de la red de Compose:

```text
http://farmacos-graphrag:8000
```

## Modelo del grafo

Nodos:

- `Drug`
- `TradeName`
- `DrugType`
- `Indication`
- `Target`
- `TargetClass`
- `Mechanism`
- `EvidenceRow`
- `SearchDocument`

Relaciones:

- `HAS_TRADE_NAME`
- `HAS_TYPE`
- `APPROVED_FOR`
- `TARGETS`
- `HAS_TARGET_CLASS`
- `HAS_MECHANISM`
- `SUPPORTED_BY`
- `HAS_SEARCH_DOCUMENT`

## Pruebas locales

```bash
uv run pytest
```

Estas pruebas no requieren Neo4j ni OpenAI.
