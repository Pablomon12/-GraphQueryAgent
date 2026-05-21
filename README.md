# Ontology Agent

Backend en Python para responder preguntas en lenguaje natural sobre una ontología RDF/OWL usando un agente que:

1. explora localmente la ontología y las instancias con `rdflib`
2. genera una consulta SPARQL de solo lectura
3. ejecuta esa consulta contra Apache Jena Fuseki
4. devuelve una respuesta textual junto con la SPARQL ejecutada

El proyecto está orientado al caso de uso de fármacos aprobados incluido en este repositorio, pero la arquitectura sirve para otros dominios RDF/OWL si se reemplazan los ficheros de `knowledge/`.

## Objetivo

El sistema permite hacer preguntas del tipo:

- `¿Qué fármacos tienen como indicación osteoporosis?`
- `¿Qué dianas están asociadas al fármaco ABALOPARATIDE?`
- `¿Qué mecanismos de acción aparecen para ABARELIX?`
- `¿Qué fármacos actúan sobre la diana PTH1R?`

La aplicación no responde directamente desde texto libre. Primero inspecciona el esquema y los datos RDF, luego compone SPARQL y finalmente consulta Fuseki.

## Arquitectura

Los componentes principales son:

- `FastAPI`: expone los endpoints HTTP.
- `OntologyExplorer`: carga localmente los ficheros RDF/OWL y ofrece herramientas de exploración al agente.
- `OntologyAgent`: orquesta el flujo `planning -> schema_discovery -> execution -> reporting`.
- `LLMClient`: llama al modelo de OpenAI para decidir qué herramientas usar y construir la consulta.
- `SparqlClient`: ejecuta SPARQL de solo lectura contra Fuseki.
- `Fuseki`: almacena y sirve los datos RDF para la consulta final.

### Flujo de una pregunta

1. El cliente envía una pregunta a `POST /ask`.
2. El agente explora localmente `knowledge/ontology` y `knowledge/data`.
3. El modelo decide qué clases, propiedades, prefijos e individuos son relevantes.
4. El agente genera SPARQL de solo lectura.
5. La SPARQL se ejecuta en Fuseki.
6. La API devuelve:
   - la pregunta original
   - la SPARQL ejecutada
   - los resultados crudos
   - una respuesta textual resumida
   - las fases completadas

## Estructura del proyecto

```text
src/ontology_agent/
  api/                 Rutas FastAPI
  agent/               Orquestación del agente y prompt del sistema
  clients/             Clientes OpenAI y SPARQL
  ontology/            Exploración local RDF/OWL
  config.py            Configuración por variables de entorno

knowledge/
  ontology/            Esquema RDF/OWL
  data/                Instancias RDF cargadas también en Fuseki

docker/
  init-fuseki.sh       Bootstrap y carga inicial de grafos en Fuseki
  fuseki-config.ttl    Configuración explícita del dataset de Fuseki

tests/                 Tests automatizados
```

## Modelo de datos del repositorio

El proyecto separa el conocimiento en dos capas:

- `knowledge/ontology/`: clases, propiedades, dominios, rangos y vocabulario del esquema
- `knowledge/data/`: instancias concretas del dominio

En el caso actual:

- la ontología describe fármacos, dianas, mecanismos de acción, indicaciones y filas del dataset
- las instancias contienen los fármacos aprobados y sus relaciones derivadas del CSV

Durante la exploración local del agente, ambas carpetas se combinan en un único grafo en memoria. Así el agente puede ver tanto el esquema como ejemplos reales antes de construir SPARQL.

## Requisitos

- Python `3.14+`
- una clave válida en `OPENAI_API_KEY`
- Docker y Docker Compose si quieres usar el despliegue completo con Fuseki

## Variables de entorno

Variables soportadas por la aplicación:

- `OPENAI_API_KEY`: clave del modelo
- `OPENAI_MODEL`: modelo OpenAI a usar
- `FUSEKI_QUERY_ENDPOINT`: endpoint de consulta SPARQL
- `ONTOLOGY_PATHS`: lista separada por comas con rutas RDF/OWL a explorar localmente
- `ONTOLOGY_PATH`: compatibilidad hacia atrás para una sola ruta
- `ONTOLOGY_GLOB`: patrón de descubrimiento de archivos RDF
- `AGENT_MAX_STEPS`: máximo de iteraciones del agente

Valores por defecto:

```bash
ONTOLOGY_PATHS=knowledge/ontology,knowledge/data
FUSEKI_QUERY_ENDPOINT=http://localhost:3030/dataset/query
OPENAI_MODEL=gpt-4.1-mini
AGENT_MAX_STEPS=10
```

### Comportamiento de Fuseki

El dataset de Fuseki está configurado explícitamente en [docker/fuseki-config.ttl](/Users/pablomon/Desktop/Master/TFM/Ontology_Agent/docker/fuseki-config.ttl:1).

Se cargan dos grafos nombrados:

- `http://example.org/graph/ontology`
- `http://example.org/graph/data`

Además, el `default graph` de Fuseki se publica como la unión del dataset. Eso permite que el agente haga consultas SPARQL simples sin necesidad de añadir `GRAPH` o `FROM` explícitos.

## API HTTP

### `GET /health`

Devuelve el estado básico de la aplicación, incluyendo:

- estado general
- rutas ontológicas configuradas
- disponibilidad de archivos RDF locales
- endpoint SPARQL configurado
- modelo OpenAI activo

Ejemplo de respuesta:

```json
{
  "status": "ok",
  "ontology_paths": ["knowledge/ontology", "knowledge/data"],
  "ontology_ready": true,
  "fuseki_query_endpoint": "http://localhost:3030/dataset/query",
  "openai_model": "gpt-4.1-mini"
}
```

### `POST /ask`

Recibe una pregunta en lenguaje natural:

```json
{
  "question": "¿Qué fármacos tienen como indicación osteoporosis?"
}
```

Ejemplo con `curl`:

```bash
curl -s -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"¿Qué fármacos tienen como indicación osteoporosis?"}'
```

Ejemplo de respuesta:

```json
{
  "question": "¿Qué fármacos tienen como indicación osteoporosis?",
  "sparql": "SELECT ...",
  "results": {},
  "answer": "ABALOPARATIDE aparece asociado a osteoporosis y postmenopausal osteoporosis.",
  "phases": ["planning", "schema_discovery", "execution", "reporting"],
  "steps": 4
}
```


## Herramientas internas del agente

Antes de consultar Fuseki, el agente dispone de estas herramientas de exploración:

- `get_schema_summary()`
- `list_ontology_files()`
- `list_prefixes()`
- `list_classes()`
- `list_properties()`
- `list_individuals(class_uri)`
- `get_class_profile(class_uri)`
- `get_usage_examples(property_uri)`
- `search_ontology(term)`
- `describe_resource(uri)`
- `run_sparql(query)`

Estas herramientas están diseñadas para que el modelo no invente clases, propiedades ni prefijos.

## Restricciones y limitaciones

- Solo se permiten consultas SPARQL de lectura.
- Si el modelo produce JSON inválido o una consulta incorrecta, el agente intenta recuperarse dentro del límite de pasos.
- La calidad de la respuesta depende de:
  - la calidad del modelado RDF
  - la consistencia entre `knowledge/ontology` y `knowledge/data`
  - la disponibilidad de Fuseki
  - la capacidad del modelo para formular la consulta adecuada
- El dominio actual tiene limitaciones conocidas descritas en `mapeo_csv_ontologia_farmacos.md`.

## Plan de prueba

### 1. Pruebas automatizadas

Ejecutar la suite:

```bash
uv run pytest
```

La suite debe validar al menos:

- carga de la ontología y de las instancias
- descubrimiento de clases, propiedades e individuos
- lectura de configuración por variables de entorno
- contrato del endpoint `/health`
- configuración RDF del dataset de Fuseki

Resultado esperado:

- todos los tests en verde

### 2. Prueba de arranque local con Docker

Levantar servicios:

```bash
docker compose up --build -d
```
Si has cambiado la configuración de Fuseki y existe un volumen anterior incompatible, recrea el despliegue:

```bash
docker compose down -v
docker compose up --build -d
```

Nota sobre la configuración de Fuseki:

- el ensamblador `docker/fuseki-config.ttl` no se monta ya directamente sobre `/fuseki/configuration`
- primero se copia a la `named volume` `fuseki-data` mediante `init-fuseki-config`
- esto evita errores de permisos como `Not writable: /fuseki/configuration`

Verificar estado:

```bash
docker compose logs fuseki
docker compose logs init-fuseki
curl -sS http://127.0.0.1:8000/health
```

Comprobaciones esperadas:

- `fuseki` arranca sin errores de dataset
- `init-fuseki` termina correctamente
- `/health` devuelve `status: ok`
- `ontology_ready` es `true`

### 3. Prueba funcional del endpoint `/ask`

Enviar una pregunta sencilla:

```bash
curl -s -X POST http://127.0.0.1:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"¿Qué fármacos tienen como indicación osteoporosis?"}'
```

Comprobaciones esperadas:

- la respuesta HTTP es `200`
- el campo `sparql` no es `null`
- el campo `answer` no está vacío
- `phases` contiene `planning`, `schema_discovery`, `execution` y `reporting`

### 4. Prueba de consultas representativas

Ejecutar al menos estas preguntas:

1. `¿Qué fármacos tienen como indicación osteoporosis?`
2. `¿Qué dianas están asociadas al fármaco ABALOPARATIDE?`
3. `¿Qué mecanismos de acción aparecen para ABARELIX?`
4. `¿Qué fármacos actúan sobre la diana PTH1R?`
5. `¿Qué nombres comerciales tiene ABATACEPT?`

Comprobaciones esperadas:

- la SPARQL generada usa recursos reales del esquema
- los resultados son coherentes con las instancias cargadas
- no aparecen errores de validación SPARQL

### 5. Prueba negativa

Enviar una pregunta fuera del dominio:

```json
{
  "question": "¿Qué pacientes tienen diagnóstico de diabetes?"
}
```

Comportamiento esperado:

- el sistema no debe inventar clases ni propiedades del dominio médico anterior
- puede devolver una respuesta vacía, indicar ausencia de datos o no encontrar soporte en la ontología actual

## Desarrollo y mantenimiento

Cuando cambies la ontología o las instancias:

1. actualiza los archivos en `knowledge/ontology` y `knowledge/data`
2. ejecuta `uv run pytest`
3. si usas Docker, recarga Fuseki con `docker compose down -v && docker compose up --build -d` si el dataset persistido ya no es compatible
4. valida manualmente varias preguntas representativas en `/docs`

## Frontend Next.js

El repositorio incluye un frontend en [frontend/package.json](/Users/pablomon/Desktop/Master/TFM/Ontology_Agent/frontend/package.json:1) construido con `Next.js`, `TypeScript` y `App Router`.

### Qué ofrece

- formulario para enviar preguntas al agente
- comprobación de salud del backend al cargar la página
- panel técnico con la `SPARQL` generada, fases, pasos y resultados crudos
- proxy interno en Next.js para hablar con FastAPI sin depender de CORS en el navegador

### Variables de entorno del frontend

Copia como base [frontend/.env.example](/Users/pablomon/Desktop/Master/TFM/Ontology_Agent/frontend/.env.example:1):

```bash
ONTOLOGY_API_BASE_URL=http://127.0.0.1:8000
```

### Arranque local

Primero arranca el backend:

```bash
docker compose up --build -d
```

O, si trabajas sin Docker:

```bash
uv sync
uv run uvicorn ontology_agent.main:app --reload
```

Después arranca el frontend:

```bash
cd frontend
npm install
npm run dev
```

La interfaz quedará disponible en `http://127.0.0.1:3000`.

### Tests del frontend

Desde `frontend/`:

```bash
npm test
```
