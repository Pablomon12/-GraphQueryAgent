# Reproducir el proyecto completo

Si, con estos dos repositorios se puede levantar el proyecto completo como en local:

- `https://github.com/Pablomon12/-GraphQueryAgent`
- `https://github.com/Pablomon12/GraphRAG-service.git`

La puesta en marcha no es un unico `docker compose up`: se levantan dos stacks Docker y el frontend se ejecuta aparte.

## Pasos

1. Clonar ambos repositorios.
2. En `-GraphQueryAgent`, crear `.env` desde `.env.example`, configurar `OPENAI_API_KEY` y ejecutar:

```bash
docker compose up --build -d
```

3. En `GraphRAG-service`, crear `.env` desde `.env.example`, configurar `OPENAI_API_KEY` y `GRAPHRAG_NEO4J_PASSWORD`, y ejecutar:

```bash
docker compose up --build -d
docker compose --profile init run --rm graphrag-init
```

4. En `-GraphQueryAgent/frontend`, crear `.env.local` desde `.env.example` y ejecutar:

```bash
npm install
npm run dev
```

## Servicios esperados

- Frontend: `http://127.0.0.1:3000`
- Backend principal: `http://127.0.0.1:8000`
- Fuseki: `http://127.0.0.1:3030`
- GraphRAG service: `http://127.0.0.1:8001`
- Neo4j Browser: `http://127.0.0.1:7474`

## Notas

Los datos RDF base estan versionados en ambos repositorios. Lo que no se reproduce desde Git son secretos, `.env`, volumenes Docker, caches e indices generados. La proyeccion de Neo4j se reconstruye con `graphrag-init`.

El README del repositorio principal ya indica este flujo: backend y Fuseki desde el `docker-compose.yml` principal, GraphRAG desde el repositorio externo y frontend por separado.
