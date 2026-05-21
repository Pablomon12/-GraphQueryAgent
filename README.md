# Ontology Agent

Aplicación con backend en FastAPI y frontend en Next.js para consultar una ontología RDF/OWL en lenguaje natural.

## Requisitos

- Docker y Docker Compose
- Python 3.14+ si quieres ejecutar el backend fuera de Docker
- Node.js 20+ para el frontend
- `OPENAI_API_KEY` configurada en el `.env`

## Iniciar el proyecto

La forma recomendada de levantar el backend y Fuseki es con Docker:

```bash
cp .env.example .env
docker compose up --build
```

Servicios disponibles:

- API: `http://127.0.0.1:8000`
- Fuseki: `http://127.0.0.1:3030`

Comprobación rápida:

```bash
curl http://127.0.0.1:8000/health
```

## Iniciar el frontend

En otra terminal:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

El frontend queda disponible en `http://127.0.0.1:3000`.

Por defecto usa `ONTOLOGY_API_BASE_URL=http://127.0.0.1:8000`.

## Ejecución local del backend sin Docker

Solo si no quieres usar contenedores:

```bash
uv sync
uv run uvicorn ontology_agent.main:app --host 0.0.0.0 --port 8000
```

En este modo necesitas tener Fuseki corriendo y la variable `FUSEKI_QUERY_ENDPOINT` bien configurada.
