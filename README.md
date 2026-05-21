# Ontology Agent

Backend en Python para responder preguntas en lenguaje natural sobre una ontología RDF/OWL, explorando la ontología en runtime y ejecutando consultas SPARQL de solo lectura contra Fuseki.

La arquitectura está inspirada en `vercel-labs/oss-data-analyst`, pero adaptada a ontologías:

- En lugar de explorar archivos YAML de un semantic layer, el agente explora directamente RDF/OWL con `rdflib`.
- En lugar de generar SQL, genera SPARQL de solo lectura.
- Mantiene un flujo de trabajo por fases: `planning -> schema_discovery -> execution -> reporting`.

## Requisitos

- Python 3.14+
- Un endpoint Fuseki accesible
- `OPENAI_API_KEY` configurada

## Variables de entorno

- `ONTOLOGY_PATHS`: lista separada por comas de carpetas con archivos `.ttl`, `.rdf`, `.owl`, `.nt` o `.xml`
- `ONTOLOGY_PATH`: compatibilidad hacia atrás para una sola carpeta de exploración
- `ONTOLOGY_GLOB`: patrón opcional para descubrir archivos RDF
- `FUSEKI_QUERY_ENDPOINT`: endpoint SPARQL de lectura
- `OPENAI_MODEL`: modelo OpenAI a usar
- `AGENT_MAX_STEPS`: máximo de pasos del agente

Valores por defecto:

```bash
ONTOLOGY_PATHS=knowledge/ontology,knowledge/data
FUSEKI_QUERY_ENDPOINT=http://localhost:3030/dataset/query
OPENAI_MODEL=gpt-4.1-mini
AGENT_MAX_STEPS=10
```

## Estructura

```text
src/ontology_agent/      Código de la aplicación
src/ontology_agent/api/  Rutas HTTP de FastAPI
src/ontology_agent/agent/ Orquestación del agente y prompts
src/ontology_agent/clients/ Clientes externos: OpenAI y SPARQL
src/ontology_agent/ontology/ Exploración local RDF/OWL sobre esquema e instancias
knowledge/ontology/     Ontologías RDF/OWL cargadas localmente
knowledge/data/         Datos semilla cargados en Fuseki
docker/                 Scripts de bootstrap de infraestructura local
tests/                  Tests automatizados
```

## Ejecutar

```bash
uv sync
uv run uvicorn ontology_agent.main:app --reload
```

## Docker y Fuseki

El proyecto incluye un despliegue con Docker Compose que:

- arranca la API en `http://127.0.0.1:8000`
- arranca Fuseki en `http://127.0.0.1:3030`
- carga automáticamente la ontología desde `knowledge/ontology/` en el grafo `http://example.org/graph/ontology`
- carga automáticamente los datos semilla desde `knowledge/data/` en el grafo `http://example.org/graph/data`
- expone en Fuseki un `default graph` que es la unión de los grafos nombrados del dataset

La separación conceptual es:

- `knowledge/ontology/`: esquema RDF/OWL
- `knowledge/data/`: instancias persistidas en Fuseki

Durante el `schema_discovery`, el agente combina localmente ambos directorios para explorar clases, propiedades e individuos antes de generar SPARQL.
Durante la ejecución SPARQL, Fuseki mantiene los grafos nombrados separados y además permite consultas simples sobre su unión desde `/dataset/query`.

Arranque:

```bash
docker compose up --build -d
```

La app dentro de Docker consulta Fuseki usando:

```bash
FUSEKI_QUERY_ENDPOINT=http://fuseki:3030/dataset/query
```

Eso permite consultas del tipo:

```sparql
PREFIX : <https://example.org/farmacos-aprobados/ontology#>
SELECT ?drug WHERE {
  ?drug a :Drug .
}
LIMIT 5
```

sin tener que añadir `GRAPH` ni `FROM`, porque el `default graph` se publica como unión del dataset.

## Tests

```bash
uv run pytest
```

Si cambias una instalación ya existente de Fuseki desde el modo autogenerado al modo con configuración explícita, puede ser necesario recrear el volumen de Fuseki una vez para evitar conflictos con la definición previa del dataset.

## Endpoints

- `GET /health`
- `POST /ask`

## Herramientas del agente

El agente dispone de herramientas de exploración ontológica antes de consultar Fuseki:

- `get_schema_summary()`
- `list_prefixes()`
- `list_classes()`
- `list_properties()`
- `list_individuals(class_uri)`
- `get_class_profile(class_uri)`
- `get_usage_examples(property_uri)`
- `search_ontology(term)`
- `describe_resource(uri)`
- `run_sparql(query)`

Ejemplo:

```bash
curl -s -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"¿Qué fármacos tienen como indicación osteoporosis?"}' | jq
```

## Contrato de respuesta

```json
{
  "question": "¿Qué pacientes tienen diagnóstico de diabetes?",
  "sparql": "SELECT ...",
  "results": {},
  "answer": "...",
  "phases": ["planning", "schema_discovery", "execution", "reporting"],
  "steps": 4
}
```
# -GraphQueryAgent
