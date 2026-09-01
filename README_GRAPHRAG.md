# GraphRAG externo

Este documento describe como el repositorio principal se integra con el servicio
GraphRAG externo que vive junto a este proyecto en `../GraphRAG-Service`.

En este repositorio no esta la implementacion completa de GraphRAG. Aqui solo
estan el cliente HTTP (`src/ontology_agent/clients/graphrag.py`), los endpoints
FastAPI `/graphrag` y `/graphrag/stream`, y las rutas proxy del frontend. El
servicio ejecutable se levanta desde `../GraphRAG-Service`.

## Arquitectura real

```text
Frontend Next.js
  -> /api/graphrag
  -> Backend FastAPI
     -> GraphRAGClient
     -> http://host.docker.internal:8001/ask
        -> GraphRAG-Service
           -> Neo4j
           -> OpenAI embeddings + modelo de respuesta
```

El servicio GraphRAG carga los ficheros RDF/Turtle versionados en su propio
directorio `knowledge/`, extrae documentos semanticos, los proyecta a Neo4j como
nodos `GraphRAGEntity`, crea indices de recuperacion hibrida y responde usando
solo la evidencia recuperada del grafo.

## Repositorios y servicios

Repositorio principal:

- `docker-compose.yml`: levanta `app`, `fuseki`, `init-fuseki-config` e
  `init-fuseki`.
- `.env`: configura `GRAPHRAG_API_BASE_URL` para que el backend Docker pueda
  llamar al servicio externo.
- `frontend/`: se ejecuta por separado con Next.js.

Repositorio externo `../GraphRAG-Service`:

- `docker-compose.yml`: levanta `neo4j` y `graphrag-service`.
- `graphrag_service/src/graphrag_service/`: implementa API, carga RDF,
  extraccion documental, proyeccion Neo4j y recuperacion.
- `knowledge/ontology/` y `knowledge/data/`: copia versionada de los TTL usados
  para construir la proyeccion GraphRAG.

## Variables de entorno

En el repositorio principal, cuando el backend corre dentro de Docker, usar:

```env
GRAPHRAG_API_BASE_URL=http://host.docker.internal:8001
```

Si el backend se ejecuta directamente en el host, usar:

```env
GRAPHRAG_API_BASE_URL=http://127.0.0.1:8001
```

En `../GraphRAG-Service/.env`, configurar al menos:

```env
OPENAI_API_KEY=your_openai_api_key
GRAPHRAG_NEO4J_PASSWORD=change_me
```

Las variables principales del servicio externo son:

- `GRAPHRAG_ONTOLOGY_DIR`
- `GRAPHRAG_DATA_DIR`
- `GRAPHRAG_INDEX_PATH`
- `GRAPHRAG_EMBEDDING_MODEL`
- `GRAPHRAG_LLM_MODEL`
- `GRAPHRAG_NEO4J_URI`
- `GRAPHRAG_NEO4J_USERNAME`
- `GRAPHRAG_NEO4J_PASSWORD`
- `GRAPHRAG_NEO4J_DATABASE`
- `GRAPHRAG_RETRIEVAL_TOP_K`
- `GRAPHRAG_EXPANSION_LIMIT`

## Puesta en marcha completa

Desde el repositorio principal:

```bash
docker compose up --build -d
```

Desde `../GraphRAG-Service`:

```bash
docker compose up --build -d
```

Si la proyeccion de Neo4j no existe o se han cambiado los TTL del servicio
externo, reconstruirla:

```bash
docker compose --profile init run --rm graphrag-init
```

El frontend se ejecuta por separado:

```bash
cd frontend
npm run dev
```

## Endpoints

Servicio GraphRAG externo:

- Health: `GET http://127.0.0.1:8001/health`
- Pregunta: `POST http://127.0.0.1:8001/ask`
- Rebuild HTTP: `POST http://127.0.0.1:8001/index/rebuild`

Backend principal:

- GraphRAG: `POST http://127.0.0.1:8000/graphrag`
- GraphRAG SSE: `POST http://127.0.0.1:8000/graphrag/stream`

Frontend:

- Proxy GraphRAG: `POST http://127.0.0.1:3000/api/graphrag`
- Proxy GraphRAG SSE: `POST http://127.0.0.1:3000/api/graphrag/stream`

Ejemplo:

```bash
curl -X POST http://127.0.0.1:8000/graphrag \
  -H "Content-Type: application/json" \
  -d '{"question":"Que mecanismo de accion y que diana tiene ABARELIX?"}'
```

## Modelo de recuperacion

El servicio externo:

1. carga RDF desde `knowledge/ontology` y `knowledge/data`;
2. extrae documentos semanticos para entidades y relaciones relevantes;
3. proyecta nodos y aristas a Neo4j;
4. crea indices vectoriales y keyword sobre `GraphRAGEntity`;
5. combina busqueda exacta y busqueda hibrida;
6. expande vecinos entrantes y salientes con limite configurado;
7. pasa solo esa evidencia al modelo para redactar la respuesta.

El resultado normalizado que consume este repositorio incluye `question`,
`answer`, `results` o evidencia equivalente, y `steps` cuando el servicio lo
informa. El endpoint `/graphrag/stream` del backend principal no recibe streaming
real del servicio externo: hace una llamada HTTP normal y emite la respuesta
final como evento SSE.

## Comprobaciones

```bash
curl http://127.0.0.1:8001/health
curl http://127.0.0.1:8000/health
curl -X POST http://127.0.0.1:8000/graphrag \
  -H "Content-Type: application/json" \
  -d '{"question":"Que mecanismo de accion y que diana tiene ABARELIX?"}'
```

Un `health` correcto del servicio externo incluye `status: "ok"`, el modelo de
respuesta, el modelo de embeddings, `node_count` y `relationship_count`.

## Pruebas

Repositorio principal:

```bash
uv run pytest
cd frontend
npm test
```

Servicio externo:

```bash
cd ../GraphRAG-Service
uv run pytest graphrag_service/tests
```

Las pruebas del servicio externo cubren configuracion, carga RDF, extraccion de
documentos, API, logica GraphRAG y acceso a Neo4j mediante dobles de prueba; no
requieren una pila Docker viva.
