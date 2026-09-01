# Ontology Agent

Aplicación full-stack para consultar una ontología RDF/OWL en lenguaje natural. El proyecto combina un backend en FastAPI, un agente que explora el esquema de la ontología antes de generar SPARQL, Apache Jena Fuseki como motor de consulta y un frontend en Next.js para lanzar preguntas y revisar la trazabilidad técnica de cada respuesta.

## Qué hace

- Recibe preguntas en lenguaje natural sobre una ontología cargada en RDF/OWL.
- Inspecciona clases, propiedades, prefijos e individuos antes de construir la consulta.
- Genera y ejecuta SPARQL de solo lectura contra Fuseki.
- Devuelve una respuesta redactada, la consulta SPARQL utilizada y los resultados crudos.
- Expone un endpoint con streaming SSE para mostrar el progreso incremental en la interfaz.
- Permite comparar el agente semantico con un modelo base sin herramientas y con un servicio GraphRAG externo sobre Neo4j.

## Arquitectura

```text
Next.js UI
   -> /api/health, /api/ask, /api/baseline, /api/graphrag
   -> FastAPI
      -> OntologyAgent
         -> OntologyExplorer (archivos RDF/OWL locales)
         -> LLMClient (OpenAI)
         -> SparqlClient (Apache Jena Fuseki)
      -> LLMClient (baseline sin herramientas)
      -> GraphRAGClient (servicio externo en http://host.docker.internal:8001)
```

## Estructura del repositorio

```text
.
├── src/ontology_agent/      # Backend FastAPI, agente, cliente LLM, cliente SPARQL
├── frontend/                # Frontend Next.js 16 + React 19
├── knowledge/
│   ├── ontology/            # Ontología base (OWL/Turtle)
│   └── data/                # Instancias/datos RDF
├── docker/                  # Inicialización y configuración de Fuseki
├── docs/                    # Documentación metodológica y de estado
├── experiments/             # Protocolo y resultados de evaluación
├── tests/                   # Tests del backend
├── docker-compose.yml       # Backend + Fuseki + bootstrap de datos
├── README_GRAPHRAG.md       # Integración con el servicio externo GraphRAG
└── pyproject.toml           # Configuración del paquete Python
```

Archivos de conocimiento incluidos en el repositorio:

- `knowledge/ontology/farmacos_aprobados.ttl`
- `knowledge/data/farm_aprobados_inst.ttl`

## Stack técnico

- Backend: FastAPI, Pydantic, RDFLib, SPARQLWrapper
- Agente: integración con OpenAI o Hugging Face + herramientas de exploración semántica
- Triple store: Apache Jena Fuseki
- Comparador externo: GraphRAG-Service + Neo4j
- Frontend: Next.js 16, React 19, TypeScript
- Tests: `pytest` y `vitest`
- Gestión Python: `uv`

## Requisitos

- Docker y Docker Compose para el flujo recomendado
- Python `3.14+` para ejecutar el backend fuera de Docker
- Node.js `20+` para el frontend
- Una `OPENAI_API_KEY` válida

## Variables de entorno

### Backend (`.env`)

Parte de este ejemplo:

```env
OPENAI_API_KEY=your_key
HF_TOKEN=your_hf_token
ONTOLOGY_PATH=knowledge/ontology
ONTOLOGY_PATHS=knowledge/ontology,knowledge/data
ONTOLOGY_GLOB=**/*.*
FUSEKI_QUERY_ENDPOINT=http://localhost:3030/dataset/query
GRAPHRAG_API_BASE_URL=http://host.docker.internal:8001
DEFAULT_LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4.1-mini
HF_MODEL=Qwen/Qwen3-4B-Instruct-2507:nscale
HF_BASE_URL=https://router.huggingface.co/v1
AGENT_MAX_STEPS=10
```

Notas:

- `OPENAI_API_KEY`: credencial para el modelo usado por el agente.
- `ONTOLOGY_PATH`: ruta legacy para una única carpeta de ontología.
- `ONTOLOGY_PATHS`: alternativa soportada por el backend para varias rutas separadas por comas, por ejemplo `knowledge/ontology,knowledge/data`.
- `ONTOLOGY_GLOB`: patrón de archivos a cargar.
- `FUSEKI_QUERY_ENDPOINT`: endpoint SPARQL del dataset.
- `GRAPHRAG_API_BASE_URL`: URL del servicio GraphRAG externo. Dentro del backend Docker se recomienda `http://host.docker.internal:8001`; fuera de Docker, `http://127.0.0.1:8001`.
- `DEFAULT_LLM_PROVIDER`: proveedor por defecto (`openai` o `huggingface`).
- `OPENAI_MODEL`: modelo de OpenAI empleado por el agente y el baseline cuando se selecciona OpenAI.
- `HF_TOKEN`, `HF_MODEL`, `HF_BASE_URL`: configuracion de Hugging Face cuando se selecciona ese proveedor.
- `AGENT_MAX_STEPS`: límite de iteraciones herramienta-modelo.

### Frontend (`frontend/.env.local`)

```env
ONTOLOGY_API_BASE_URL=http://127.0.0.1:8000
```

## Puesta en marcha recomendada

El `docker-compose.yml` levanta:

- `app`: backend FastAPI
- `fuseki`: servidor Jena Fuseki
- `init-fuseki-config`: preparación del dataset
- `init-fuseki`: carga inicial de ontología y datos RDF

### 1. Arrancar backend y Fuseki

```bash
cp .env.example .env
docker compose up --build
```

Servicios disponibles:

- API: `http://127.0.0.1:8000`
- Documentación OpenAPI: `http://127.0.0.1:8000/docs`
- Fuseki: `http://127.0.0.1:3030`

Comprobación rápida:

```bash
curl http://127.0.0.1:8000/health
```

Si la carga de la ontología fue correcta, el backend responderá con `status: "ok"` y `ontology_ready: true`.

### 2. Arrancar GraphRAG externo

El sistema `graph_rag` se ejecuta desde el repositorio hermano `../GraphRAG-Service`.
Ver detalles en `README_GRAPHRAG.md`.

```bash
cd ../GraphRAG-Service
docker compose up --build -d
```

Si los TTL usados por GraphRAG han cambiado o la base Neo4j esta vacia:

```bash
docker compose --profile init run --rm graphrag-init
```

Comprobacion rapida:

```bash
curl http://127.0.0.1:8001/health
```

### 3. Arrancar el frontend

En otra terminal:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

La interfaz queda disponible en `http://127.0.0.1:3000`.

## API

### `GET /health`

Devuelve el estado general del servicio:

- disponibilidad del backend
- rutas de ontología configuradas
- si la ontología está lista
- endpoint de Fuseki
- modelo OpenAI configurado

Ejemplo:

```bash
curl http://127.0.0.1:8000/health
```

### `POST /ask`

Recibe una pregunta y devuelve la respuesta completa al finalizar.

```bash
curl -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"¿Qué fármacos tienen como indicación osteoporosis?"}'
```

Respuesta esperada:

```json
{
  "question": "¿Qué fármacos tienen como indicación osteoporosis?",
  "sparql": "SELECT ...",
  "results": {},
  "answer": "...",
  "phases": ["planning", "schema_discovery", "execution", "reporting"],
  "steps": 4
}
```

### `POST /ask/stream`

Expone la misma operación mediante Server-Sent Events (`text/event-stream`). El frontend la usa para mostrar:

- fases del flujo
- fragmentos incrementales de la respuesta
- payload final con SPARQL y resultados

Ejemplo:

```bash
curl -N -X POST http://127.0.0.1:8000/ask/stream \
  -H "Content-Type: application/json" \
  -d '{"question":"¿Qué mecanismos de acción aparecen para ABARELIX?"}'
```

### `POST /baseline`

Ejecuta el mismo modelo configurado sin herramientas, sin SPARQL y sin contexto externo.

```bash
curl -X POST http://127.0.0.1:8000/baseline \
  -H "Content-Type: application/json" \
  -d '{"question":"¿Cuántos fármacos están indicados para diabetes mellitus?"}'
```

### `POST /graphrag`

Delega la pregunta en el servicio externo configurado mediante `GRAPHRAG_API_BASE_URL`.

```bash
curl -X POST http://127.0.0.1:8000/graphrag \
  -H "Content-Type: application/json" \
  -d '{"question":"¿Qué mecanismo de acción y qué diana tiene ABARELIX?"}'
```

## Flujo del agente

El backend instancia un `OntologyAgent` que trabaja con estas herramientas:

- `read_semantic_catalog`
- `get_schema_summary`
- `list_ontology_files`
- `list_prefixes`
- `list_classes`
- `list_properties`
- `list_individuals`
- `get_class_profile`
- `get_usage_examples`
- `search_ontology`
- `describe_resource`
- `run_sparql`

La ejecución está diseñada para:

1. consultar primero el catálogo semántico persistente
2. usar herramientas RDF granulares solo si falta precisión o hay ambigüedad
3. construir una SPARQL de lectura
4. ejecutar la consulta en Fuseki como fuente factual final
5. sintetizar una respuesta final y devolver trazabilidad

## Catálogo semántico persistente

El repositorio incluye un catálogo semántico versionado en `knowledge/catalog/`. Este catálogo está inspirado en una arquitectura de agente con capa semántica legible: el modelo consulta documentación estructurada antes de construir SPARQL, en vez de reconstruir siempre el esquema mediante muchas herramientas pequeñas.

Archivos principales:

- `knowledge/catalog/README.md`: guía de uso del catálogo.
- `knowledge/catalog/overview.md`: resumen del dominio, tamaño del grafo y relaciones principales.
- `knowledge/catalog/schema.md`: clases, propiedades, dominio/rango, conteos y ejemplos.
- `knowledge/catalog/query_patterns.md`: patrones SPARQL recomendados.
- `knowledge/catalog/entity_indexes.md`: entidades frecuentes y ejemplos experimentales.
- `knowledge/catalog/catalog.json`: versión estructurada para lectura programática.

El catálogo no se genera al arrancar la aplicación, el backend ni Docker Compose. Si cambian los RDF, debe actualizarse explícitamente. El catálogo es contexto operativo; la respuesta factual final debe seguir saliendo de `run_sparql`.

## Frontend

La interfaz web:

- consulta `/api/health` al cargar
- envía preguntas a `/api/ask/stream`, `/api/baseline/stream` y `/api/graphrag/stream`
- muestra estado general del sistema
- presenta la respuesta textual, las fases ejecutadas, la SPARQL generada, los resultados crudos y la comparacion entre sistemas

El frontend usa rutas API internas de Next.js como proxy hacia el backend configurado en `ONTOLOGY_API_BASE_URL`.

## Tests

### Backend

```bash
uv run pytest
```

Cobertura actual relevante:

- estado del endpoint `/health`
- descubrimiento de clases, propiedades e individuos
- catálogo semántico persistente y herramienta `read_semantic_catalog`
- carga de variables desde `.env`
- ejecución y streaming del agente
- configuración de Fuseki

### Frontend

```bash
cd frontend
npm test
```

## Experimento de evaluacion

El protocolo para comparar el agente semantico, el modelo base sin herramientas y `graph_rag` esta documentado en `docs/semantic_vs_baseline_experiment.md`. GraphRAG se expone como API externa compatible con `README_GRAPHRAG.md` y se configura mediante `GRAPHRAG_API_BASE_URL`.

Artefactos asociados:

- `experiments/semantic_vs_baseline/questions.json`: preguntas, referencias y SPARQL de verdad de referencia.
- `experiments/semantic_vs_baseline/results_template.csv`: plantilla para registrar las 36 ejecuciones del experimento.
- `experiments/semantic_vs_baseline/runs/20260820T152538Z/`: ejecucion final registrada con 36 runs, resumen agregado y payloads crudos.

## Desarrollo

Dependencias Python:

```bash
uv sync
```

Build del frontend:

```bash
cd frontend
npm run build
```

## Consideraciones

- El proyecto depende de OpenAI para generar la SPARQL y redactar la respuesta final.
- La validez de la respuesta depende de la calidad de la ontología cargada y de los datos disponibles en Fuseki.
- El `docker-compose.yml` principal arranca backend y triple store; el frontend y el servicio externo GraphRAG se ejecutan por separado.
- El repositorio contiene artefactos de distribución en `dist/`, aunque el flujo principal está orientado a ejecución local/desarrollo.
