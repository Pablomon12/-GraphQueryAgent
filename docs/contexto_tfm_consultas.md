# Contexto para futuras consultas del TFM

## Objetivo del trabajo

El Trabajo Fin de Máster estudia técnicas para mejorar la fiabilidad y la factualidad de modelos de lenguaje de gran tamaño (LLMs) mediante el uso de conocimiento estructurado.

El problema principal que se quiere abordar es la generación de respuestas incorrectas, no verificables o inventadas por parte de los LLMs, fenómeno conocido como alucinación. El trabajo se centra en comprobar si el uso de grafos de conocimiento, ontologías y mecanismos de recuperación sobre grafo permite reducir estas alucinaciones frente a un modelo base.

El caso de estudio utiliza un dominio farmacológico basado en una ontología RDF/OWL de fármacos aprobados. El sistema permite formular preguntas en lenguaje natural y compara distintas estrategias de respuesta:

- Modelo base: LLM sin acceso a ontología, SPARQL, herramientas ni contexto externo.
- Modelo con capa semántica: LLM asistido por exploración de ontología y ejecución de consultas SPARQL sobre un triple store.
- Modelo con Graph RAG: LLM asistido por recuperación de información desde un grafo de conocimiento antes de generar la respuesta.

El objetivo experimental es medir si estas técnicas mejoran la exactitud factual, la completitud, la trazabilidad y la reducción de alucinaciones.

## Flujo de datos de la API del proyecto

La arquitectura general del proyecto combina un frontend en Next.js, un backend en FastAPI, un agente semántico, una ontología RDF/OWL local y un servidor Apache Jena Fuseki como triple store.

El flujo principal de una pregunta es el siguiente:

1. El usuario introduce una pregunta en lenguaje natural desde la interfaz web.
2. El frontend envía la pregunta al backend mediante los endpoints internos de Next.js.
3. El backend FastAPI recibe la petición en los endpoints `/ask`, `/ask/stream`, `/baseline` o `/baseline/stream`.
4. Si se utiliza el modelo base, el backend llama directamente al LLM con la pregunta, sin proporcionar contexto externo ni herramientas.
5. Si se utiliza el agente semántico, el backend instancia `OntologyAgent`.
6. El agente consulta primero la estructura de la ontología mediante `OntologyExplorer`.
7. El agente identifica clases, propiedades, prefijos, individuos y ejemplos relevantes.
8. El agente genera una consulta SPARQL de solo lectura.
9. La consulta SPARQL se ejecuta contra Apache Jena Fuseki mediante `SparqlClient`.
10. Fuseki devuelve resultados estructurados procedentes del grafo RDF.
11. El LLM redacta una respuesta final usando los resultados obtenidos.
12. La API devuelve la respuesta textual junto con la consulta SPARQL, los resultados crudos, las fases ejecutadas y el número de pasos.

Representación simplificada:

```text
Usuario
  -> Frontend Next.js
  -> API FastAPI
     -> Modelo base
        -> LLM
        -> Respuesta sin trazabilidad semántica

     -> Agente semántico
        -> OntologyExplorer
        -> Generación SPARQL
        -> Apache Jena Fuseki
        -> Resultados RDF
        -> LLM
        -> Respuesta con trazabilidad
```

Los componentes principales del proyecto son:

- `src/ontology_agent/api/routes.py`: define los endpoints de la API.
- `src/ontology_agent/agent/service.py`: implementa el flujo del agente semántico.
- `src/ontology_agent/agent/prompts.py`: contiene las instrucciones del agente.
- `src/ontology_agent/ontology/explorer.py`: explora la ontología local.
- `src/ontology_agent/clients/sparql.py`: ejecuta consultas SPARQL contra Fuseki.
- `knowledge/ontology/farmacos_aprobados.ttl`: contiene el esquema OWL/RDF.
- `knowledge/data/farm_aprobados_inst.ttl`: contiene las instancias RDF.
- `docs/semantic_vs_baseline_experiment.md`: documenta el protocolo experimental actual.
- `experiments/semantic_vs_baseline/questions.json`: define preguntas, respuestas esperadas y SPARQL de referencia.

## Normas para futuras respuestas y consultas

Toda información proporcionada para el TFM debe cumplir las siguientes normas:

1. No inventar datos, resultados experimentales, cifras, métricas, referencias bibliográficas ni conclusiones.
2. Toda afirmación factual debe estar respaldada por una fuente verificable.
3. Para conceptos técnicos generales, usar fuentes oficiales o documentación técnica reconocida.
4. Para afirmaciones sobre el proyecto, usar como fuente el código, los ficheros de configuración, la ontología o la documentación local del repositorio.
5. Para afirmaciones sobre resultados, usar únicamente datos procedentes de los experimentos ejecutados o de los ficheros de resultados generados.
6. Si una información no está disponible, indicarlo explícitamente en vez de asumirla.
7. Si se propone texto para la memoria, mantener un tono académico, claro y prudente.
8. Evitar afirmar que una técnica mejora a otra si todavía no se han ejecutado los experimentos correspondientes.
9. Diferenciar claramente entre:
   - hechos observados en el proyecto,
   - hipótesis de trabajo,
   - decisiones de diseño,
   - resultados experimentales,
   - interpretación o discusión.
10. No usar referencias bibliográficas ficticias. Si se necesita citar literatura, debe buscarse y verificarse la fuente.

## Criterio de factualidad

En este TFM, una respuesta se considera factual cuando:

- coincide con la información presente en el grafo RDF o en la fuente oficial usada como referencia;
- no introduce entidades, relaciones, mecanismos, indicaciones o cifras que no estén respaldadas;
- permite rastrear el origen de la respuesta mediante consulta SPARQL, resultados estructurados o documentación verificable.

Una respuesta se considera alucinada cuando:

- inventa entidades no presentes en la fuente;
- atribuye relaciones no verificadas;
- proporciona cifras no respaldadas;
- mezcla conocimiento externo con datos locales sin advertirlo;
- presenta como hecho una hipótesis o inferencia no comprobada.

## Normas específicas para documentación LaTeX del TFM

Cuando se genere texto para el cuerpo del TFM:

- escribir en español académico;
- usar párrafos concisos;
- evitar lenguaje excesivamente comercial o grandilocuente;
- no sobrecargar el texto con detalles de implementación;
- priorizar el problema, la metodología, los resultados y la discusión;
- mantener el límite aproximado de 25 páginas para el cuerpo principal;
- mover detalles extensos, consultas completas, capturas o tablas largas a anexos si es necesario.

## Comparación experimental prevista

La comparación principal debe incluir tres sistemas:

1. `base_model`: modelo de lenguaje sin acceso a fuentes externas.
2. `semantic_agent`: agente con exploración de ontología y consultas SPARQL.
3. `graph_rag`: sistema con recuperación de información desde el grafo.

Las métricas recomendadas son:

- exactitud factual;
- precisión;
- recall;
- F1;
- completitud;
- número de alucinaciones;
- trazabilidad;
- latencia;
- número de pasos, cuando aplique.

Las preguntas de evaluación deben mantenerse iguales entre sistemas para que la comparación sea justa.

## Regla de oro

Si no existe una fuente oficial, un fichero del proyecto, una ejecución experimental o una evidencia verificable que respalde una afirmación, la afirmación no debe presentarse como hecho.
