# Ontology Agent

Aplicación full-stack para consultar una ontología RDF/OWL en lenguaje natural. El proyecto combina un backend en FastAPI, un agente que explora el esquema de la ontología antes de generar SPARQL, Apache Jena Fuseki como motor de consulta y un frontend en Next.js para lanzar preguntas y revisar la trazabilidad técnica de cada respuesta.

## Qué hace

- Recibe preguntas en lenguaje natural sobre una ontología cargada en RDF/OWL.
- Inspecciona clases, propiedades, prefijos e individuos antes de construir la consulta.
- Genera y ejecuta SPARQL de solo lectura contra Fuseki.
- Devuelve una respuesta redactada, la consulta SPARQL utilizada y los resultados crudos.
- Expone un endpoint con streaming SSE para mostrar el progreso incremental en la interfaz.

## Arquitectura

```text
Next.js UI
   -> /api/health, /api/ask, /api/ask/stream
   -> FastAPI
      -> OntologyAgent
         -> OntologyExplorer (archivos RDF/OWL locales)
         -> LLMClient (OpenAI)
         -> SparqlClient (Apache Jena Fuseki)
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
├── tests/                   # Tests del backend
├── docker-compose.yml       # Backend + Fuseki + bootstrap de datos
└── pyproject.toml           # Configuración del paquete Python
```

Archivos de conocimiento incluidos en el repositorio:

- `knowledge/ontology/farmacos_aprobados.ttl`
- `knowledge/data/farm_aprobados_inst.ttl`

## Stack técnico

- Backend: FastAPI, Pydantic, RDFLib, SPARQLWrapper
- Agente: integración con OpenAI + herramientas de exploración semántica
- Triple store: Apache Jena Fuseki
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
ONTOLOGY_PATH=knowledge/ontology
ONTOLOGY_GLOB=**/*.*
FUSEKI_QUERY_ENDPOINT=http://localhost:3030/dataset/query
OPENAI_MODEL=gpt-4.1-mini
AGENT_MAX_STEPS=10
```

Notas:

- `OPENAI_API_KEY`: credencial para el modelo usado por el agente.
- `ONTOLOGY_PATH`: ruta legacy para una única carpeta de ontología.
- `ONTOLOGY_PATHS`: alternativa soportada por el backend para varias rutas separadas por comas, por ejemplo `knowledge/ontology,knowledge/data`.
- `ONTOLOGY_GLOB`: patrón de archivos a cargar.
- `FUSEKI_QUERY_ENDPOINT`: endpoint SPARQL del dataset.
- `OPENAI_MODEL`: modelo de OpenAI empleado por el agente.
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

### 2. Arrancar el frontend

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

## Flujo del agente

El backend instancia un `OntologyAgent` que trabaja con estas herramientas:

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

1. explorar primero el esquema y los datos disponibles
2. construir una SPARQL de lectura
3. ejecutar la consulta en Fuseki
4. sintetizar una respuesta final y devolver trazabilidad

## Frontend

La interfaz web:

- consulta `/api/health` al cargar
- envía preguntas a `/api/ask/stream`
- muestra estado general del sistema
- presenta la respuesta textual, las fases ejecutadas, la SPARQL generada y los resultados crudos

El frontend usa rutas API internas de Next.js como proxy hacia el backend configurado en `ONTOLOGY_API_BASE_URL`.

## Tests

### Backend

```bash
uv run pytest
```

Cobertura actual relevante:

- estado del endpoint `/health`
- descubrimiento de clases, propiedades e individuos
- carga de variables desde `.env`
- ejecución y streaming del agente
- configuración de Fuseki

### Frontend

```bash
cd frontend
npm test
```

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
- El flujo Docker arranca backend y triple store, pero el frontend se ejecuta por separado.
- El repositorio contiene artefactos de distribución en `dist/`, aunque el flujo principal está orientado a ejecución local/desarrollo.
