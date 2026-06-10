# Informe de estado actual del proyecto

Fecha de revision: 2026-06-03

## 1. Resumen ejecutivo

El proyecto implementa una aplicacion full-stack para consultar informacion farmacologica en lenguaje natural y comparar tres estrategias de respuesta basadas en modelos de lenguaje:

1. `semantic_agent`: agente con acceso a una ontologia RDF/OWL local, exploracion semantica y ejecucion de consultas SPARQL sobre Apache Jena Fuseki.
2. `base_model`: el mismo modelo de lenguaje configurado, pero sin herramientas, sin acceso al grafo y sin contexto externo.
3. `graph_rag`: integracion HTTP con un servicio GraphRAG externo basado en Neo4j, embeddings y recuperacion de evidencia.

El estado actual del repositorio muestra que el backend, el frontend, la ontologia local, la carga en Fuseki, la comparacion experimental y los endpoints de los tres sistemas estan definidos. Tambien existen pruebas automatizadas para el backend y para parte del frontend. No se observan resultados experimentales consolidados en el repositorio; por tanto, todavia no debe afirmarse que un sistema supera a otro hasta ejecutar y registrar el protocolo previsto.

## 2. Objetivo del proyecto

El objetivo tecnico y experimental es estudiar si el uso de conocimiento estructurado reduce respuestas incorrectas o no verificables de un LLM en el dominio de farmacos aprobados. Para ello, el sistema permite formular preguntas en lenguaje natural y comparar:

- un modelo base sin fuentes externas;
- un agente semantico que consulta una ontologia RDF mediante SPARQL;
- un sistema GraphRAG que recupera evidencia desde un grafo Neo4j.

La comparacion prevista evalua exactitud factual, precision, recall, F1, completitud, alucinaciones, trazabilidad, latencia y numero de pasos.

## 3. Estado actual por componente

### 3.1 Backend FastAPI

El backend se encuentra en `src/ontology_agent/`. La aplicacion principal se instancia en `src/ontology_agent/main.py` y expone los endpoints definidos en `src/ontology_agent/api/routes.py`.

Endpoints principales:

- `GET /health`: informa del estado del backend, rutas de ontologia, disponibilidad de ontologia, endpoint Fuseki, URL GraphRAG y modelo OpenAI configurado.
- `POST /ask`: ejecuta el agente semantico y devuelve una respuesta completa.
- `POST /ask/stream`: ejecuta el agente semantico mediante Server-Sent Events.
- `POST /baseline`: ejecuta el modelo base sin herramientas.
- `POST /baseline/stream`: version streaming del modelo base.
- `POST /graphrag`: delega la pregunta en el servicio GraphRAG externo.
- `POST /graphrag/stream`: version streaming simulada para GraphRAG, ya que actualmente llama una vez al servicio externo y emite la respuesta como delta.

El backend usa `Settings.from_env()` para configurar rutas de ontologia, Fuseki, GraphRAG, modelo OpenAI y limite de pasos del agente.

### 3.2 Ontologia y datos RDF

El repositorio incluye conocimiento local en:

- `knowledge/ontology/farmacos_aprobados.ttl`
- `knowledge/data/farm_aprobados_inst.ttl`

`OntologyExplorer` carga estos ficheros mediante RDFLib y ofrece herramientas para listar ficheros, prefijos, clases, propiedades, individuos, perfiles de clase, ejemplos de uso, busqueda por termino y descripcion de recursos.

La configuracion actual admite `ONTOLOGY_PATHS`, con valor recomendado `knowledge/ontology,knowledge/data`, y mantiene compatibilidad con `ONTOLOGY_PATH`.

### 3.3 Apache Jena Fuseki

`docker-compose.yml` define un servicio `fuseki` basado en `stain/jena-fuseki:5.1.0`. El flujo de arranque incluye:

- `init-fuseki-config`: prepara la configuracion del dataset.
- `fuseki`: levanta el triple store.
- `init-fuseki`: carga ontologia y datos RDF mediante scripts en `docker/`.
- `app`: backend FastAPI que consulta Fuseki en `http://fuseki:3030/dataset/query` dentro de Docker.

El cliente `SparqlClient` valida que las consultas sean de lectura antes de ejecutarlas. Se permiten consultas que comienzan por `SELECT`, `ASK`, `CONSTRUCT`, `DESCRIBE`, `PREFIX` o `BASE`, y se bloquean palabras clave de actualizacion como `INSERT`, `DELETE`, `DROP`, `CLEAR`, `CREATE`, `LOAD`, `COPY`, `MOVE` y `ADD`.

### 3.4 Cliente OpenAI

`LLMClient` encapsula las llamadas al modelo OpenAI configurado mediante `OPENAI_MODEL`, por defecto `gpt-4.1-mini`. Las llamadas usan:

- `temperature=0`;
- `response_format={"type": "json_object"}`;
- modo normal y modo streaming.

La clave se lee de `OPENAI_API_KEY`, con carga opcional desde `.env`.

### 3.5 Frontend Next.js

El frontend se encuentra en `frontend/` y usa Next.js 16, React 19, TypeScript y Vitest. La interfaz principal esta en `frontend/src/components/ontology-console.tsx`.

Funcionalidades observadas:

- consulta del estado del sistema;
- ejecucion manual de preguntas;
- visualizacion de respuesta, fases, SPARQL y resultados;
- comparacion entre `semantic_agent`, `base_model` y `graph_rag`;
- preguntas de evaluacion predefinidas;
- calculo de metricas en la interfaz para apoyar el experimento.

Las rutas API internas de Next.js actuan como proxy hacia el backend configurado por `ONTOLOGY_API_BASE_URL`.

### 3.6 Documentacion y experimento

La documentacion local relevante incluye:

- `README.md`: describe arquitectura, puesta en marcha, API y flujo del agente.
- `README_GRAPHRAG.md`: describe una arquitectura GraphRAG externa basada en Neo4j y `neo4j-graphrag`.
- `docs/contexto_tfm_consultas.md`: fija el contexto metodologico del TFM y reglas de factualidad.
- `docs/semantic_vs_baseline_experiment.md`: define el protocolo experimental.
- `experiments/semantic_vs_baseline/questions.json`: define las preguntas, respuestas esperadas y SPARQL de referencia.
- `experiments/semantic_vs_baseline/results_template.csv`: plantilla para registrar resultados.

El protocolo actual contempla 4 preguntas, 3 sistemas y 3 repeticiones por pregunta, es decir, 36 ejecuciones.

## 4. Flujo de funcionamiento de cada modelo

### 4.1 Modelo base (`base_model`)

El modelo base representa la condicion de control del experimento. Su objetivo es medir que responde el LLM usando solo su conocimiento parametrico.

Flujo:

1. El usuario introduce una pregunta en la interfaz.
2. El frontend envia la pregunta al endpoint interno correspondiente, que la reenvia al backend.
3. El backend recibe la peticion en `/baseline` o `/baseline/stream`.
4. `routes.py` construye un prompt de sistema que obliga al modelo a responder sin herramientas, sin ontologia, sin SPARQL, sin archivos y sin contexto externo.
5. El backend llama a `LLMClient` con la pregunta literal del usuario.
6. OpenAI devuelve un JSON con la clave `answer`.
7. El backend transforma la salida en `BaselineResponse`, con `question`, `answer` y `steps`.
8. El frontend muestra la respuesta textual.

Caracteristicas:

- No hay consulta a RDF, Fuseki ni Neo4j.
- No existe trazabilidad semantica.
- No se devuelven resultados estructurados ni consulta ejecutada.
- Sirve como linea base para estimar alucinacion o falta de completitud frente a sistemas con grafo.

Riesgo principal:

- El modelo puede responder con informacion no presente en los datos locales, porque no tiene acceso a la fuente de verdad del proyecto.

### 4.2 Agente semantico (`semantic_agent`)

El agente semantico es el sistema principal del repositorio. Combina LLM, herramientas de exploracion de ontologia y ejecucion SPARQL.

Flujo:

1. El usuario introduce una pregunta en lenguaje natural.
2. El frontend la envia a `/ask` o `/ask/stream`.
3. El backend delega la ejecucion en `OntologyAgent`.
4. Antes de empezar, el agente llama a `OntologyExplorer.ensure_ready()` para comprobar que hay ficheros RDF/OWL disponibles.
5. El agente crea una conversacion con:
   - `SYSTEM_PROMPT`, que define el rol de analista RDF/OWL/SPARQL;
   - la pregunta del usuario;
   - la instruccion de explorar la ontologia antes de construir SPARQL.
6. En cada paso, el LLM debe devolver JSON valido. Puede devolver una llamada a herramienta o una respuesta final.
7. Si devuelve una herramienta, el backend ejecuta una de las herramientas disponibles:
   - `get_schema_summary`;
   - `list_ontology_files`;
   - `list_prefixes`;
   - `list_classes`;
   - `list_properties`;
   - `list_individuals`;
   - `get_class_profile`;
   - `get_usage_examples`;
   - `search_ontology`;
   - `describe_resource`;
   - `run_sparql`.
8. Las herramientas de exploracion consultan el grafo RDF local cargado por RDFLib.
9. Cuando el agente necesita ejecutar la consulta final, usa `run_sparql`.
10. `run_sparql` valida que la consulta sea de solo lectura y la envia a Fuseki mediante `SparqlClient`.
11. Fuseki devuelve resultados estructurados en JSON.
12. El resultado de la herramienta se reinyecta en la conversacion como mensaje de usuario.
13. El ciclo continua hasta que el LLM devuelve `final: true` o se alcanza `AGENT_MAX_STEPS`.
14. La respuesta final incluye:
   - pregunta original;
   - SPARQL ejecutada;
   - resultados crudos;
   - respuesta redactada;
   - fases completadas;
   - numero de pasos.

En modo streaming, el agente emite eventos SSE:

- `phase`: llamada al LLM o herramienta ejecutada;
- `answer_delta`: fragmentos incrementales de la respuesta cuando ya se detecta el campo `answer`;
- `final`: payload final con respuesta, SPARQL y resultados.

Caracteristicas:

- Tiene trazabilidad completa cuando finaliza correctamente.
- El prompt obliga a explorar la ontologia antes de generar SPARQL.
- La consulta final debe ejecutarse antes de responder.
- El backend impone una barrera adicional contra consultas SPARQL de escritura.

Riesgos actuales:

- La calidad depende de que el LLM elija bien las herramientas y construya una SPARQL correcta.
- Si el modelo devuelve JSON invalido, el agente intenta corregirlo, pero consume pasos.
- Si se alcanza el limite `AGENT_MAX_STEPS`, la respuesta final indica que no se pudo completar.

### 4.3 GraphRAG (`graph_rag`)

GraphRAG aparece integrado en este repositorio como cliente HTTP hacia un servicio externo. La implementacion completa del servicio externo esta descrita en `README_GRAPHRAG.md`, pero en este repositorio solo se observa el cliente `GraphRAGClient` y los endpoints proxy.

Flujo implementado en este repositorio:

1. El usuario introduce una pregunta.
2. El frontend la envia a `/graphrag` o `/graphrag/stream`.
3. El backend comprueba que existe `graphrag_client`.
4. `GraphRAGClient.ask()` construye una peticion HTTP `POST` a `{GRAPHRAG_API_BASE_URL}/ask`.
5. La peticion contiene:
   - `question`;
   - `top_k`, por defecto 5.
6. El servicio GraphRAG externo devuelve un JSON.
7. El backend normaliza la respuesta:
   - usa `answer`, `response` o `result` como texto de respuesta;
   - usa `results`, `evidence`, `context` o el payload completo como evidencia/resultados;
   - usa `steps` si viene informado.
8. La API devuelve `GraphRAGResponse` al frontend.

Flujo esperado del servicio externo segun la documentacion:

1. El CSV `farmacos_aprobados.csv` se parsea y normaliza.
2. Los farmacos, indicaciones, dianas, mecanismos y evidencias se cargan como nodos y relaciones en Neo4j.
3. Se crean embeddings y un indice vectorial.
4. Ante una pregunta, GraphRAG recupera evidencia relevante desde Neo4j.
5. El LLM redacta una respuesta usando solo el contexto recuperado.
6. Si no hay evidencia suficiente, el sistema deberia abstenerse.

Caracteristicas:

- La trazabilidad depende de que el servicio externo devuelva evidencia o contexto.
- No usa Fuseki ni la ontologia RDF local directamente desde este backend.
- Permite comparar una estrategia basada en SPARQL frente a una estrategia basada en recuperacion vectorial sobre grafo Neo4j.

Riesgos actuales:

- El repositorio principal no contiene la implementacion ejecutable completa descrita en `README_GRAPHRAG.md`; solo contiene el cliente y la integracion.
- El endpoint `/graphrag/stream` no hace streaming real desde el servicio externo: llama una vez a GraphRAG y emite la respuesta completa como delta.
- Si `GRAPHRAG_API_BASE_URL` no apunta a un servicio activo, el backend devolvera error 502.

## 5. Flujo global de la aplicacion

Representacion simplificada:

```text
Usuario
  -> Frontend Next.js
     -> API routes internas
        -> Backend FastAPI
           -> /baseline
              -> LLM OpenAI
              -> respuesta sin trazabilidad

           -> /ask
              -> OntologyAgent
                 -> OntologyExplorer sobre RDFLib
                 -> generacion SPARQL
                 -> SparqlClient
                 -> Apache Jena Fuseki
                 -> resultados RDF
                 -> respuesta con SPARQL y resultados

           -> /graphrag
              -> GraphRAGClient
              -> servicio externo Neo4j GraphRAG
              -> respuesta con evidencia si el servicio la proporciona
```

## 6. Pruebas y verificacion existente

El repositorio incluye pruebas backend en `tests/test_app.py`. La cobertura observada verifica:

- estado de `/health`;
- descubrimiento de ficheros, clases, propiedades e individuos;
- carga de variables desde `.env`;
- flujo del agente con herramientas;
- streaming del agente;
- endpoints `/baseline` y `/baseline/stream`;
- proxy de GraphRAG y streaming de GraphRAG.

El frontend incluye pruebas en:

- `frontend/src/lib/__tests__/api.test.ts`;
- `frontend/src/components/__tests__/ontology-console.test.tsx`.

Comandos documentados:

```bash
uv run pytest
cd frontend
npm run test
```

## 7. Pendientes y limitaciones

1. Ejecutar el protocolo experimental completo y registrar resultados en `experiments/semantic_vs_baseline/results_template.csv`.
2. Confirmar en ejecucion real que Fuseki carga correctamente ontologia y datos con Docker Compose.
3. Confirmar en ejecucion real que el servicio GraphRAG externo esta disponible en `GRAPHRAG_API_BASE_URL`.
4. Diferenciar claramente en la memoria del TFM entre resultados medidos y expectativas de diseno.
5. Si se necesita streaming real de GraphRAG, modificar el servicio externo o el cliente para soportar eventos incrementales.
6. Revisar si el requisito `Python >=3.14` es intencionado, porque puede limitar la reproducibilidad en entornos donde Python 3.14 no este disponible.

## 8. Conclusion

El proyecto esta en un estado funcional de integracion avanzada: dispone de backend, frontend, ontologia local, triple store, cliente LLM, comparacion con baseline, integracion GraphRAG y protocolo experimental definido. La parte mas solida del sistema es el agente semantico con trazabilidad SPARQL, ya que su flujo esta implementado directamente en el repositorio y cuenta con pruebas unitarias. La comparacion experimental esta preparada, pero sus conclusiones aun dependen de ejecutar las 36 pruebas previstas y registrar metricas verificables.
