# Experimento: agente semantico vs modelo base vs GraphRAG

Este protocolo compara el agente con herramientas semanticas frente al mismo modelo base sin herramientas y frente a un servicio GraphRAG externo sobre Neo4j. El objetivo es medir si las capas con grafo mejoran exactitud factual, completitud, trazabilidad y eficiencia al responder preguntas sobre farmacos aprobados.

La especificacion machine-readable esta en `experiments/semantic_vs_baseline/questions.json` y la plantilla de registro esta en `experiments/semantic_vs_baseline/results_template.csv`.

## Sistemas comparados

- `semantic_agent`: backend actual del proyecto, usando `OntologyAgent`, exploracion de ontologia, generacion y ejecucion de SPARQL, y respuesta final con trazabilidad.
- `base_model`: el mismo `OPENAI_MODEL` y `temperature=0`, pero sin acceso a archivos de ontologia, endpoint SPARQL, herramientas, ejemplos de esquema ni resultados RDF.
- `graph_rag`: servicio HTTP externo descrito en `README_GRAPHRAG.md`, usando Neo4j, OpenAI y `neo4j-graphrag` para recuperar evidencia y redactar la respuesta.

El baseline debe recibir solo la pregunta literal. No debe incluirse contexto extra del dominio, propiedades RDF, clases, prefijos ni fragmentos de datos.

## Tipos de prueba y consultas de evaluacion

Cada tipo de prueba parte de una consulta SPARQL de referencia. Esa consulta se ejecuta contra Fuseki para fijar la respuesta esperada del experimento y no se entrega al `base_model`.

| Tipo | ID | Pregunta | Respuesta esperada | Medidas principales |
| --- | --- | --- | --- | --- |
| Distribucion por categoria | `drug_type_distribution` | ¿Cuantos farmacos hay por cada tipo de farmaco? | Small molecule 1440; Protein 162; Antibody 106; Unknown 21; Oligonucleotide 19; Antibody drug conjugate 13; Gene 10; Enzyme 7; Oligosaccharide 6; Cell 2 | Exactitud, completitud, alucinaciones, trazabilidad |
| Conteo simple | `diabetes_mellitus_count` | ¿Cuantos farmacos estan indicados para diabetes mellitus? | 63 farmacos distintos | Exactitud numerica, alucinaciones, trazabilidad |
| Extraccion de atributos | `abarelix_mechanism_target` | ¿Que mecanismo de accion y que diana tiene ABARELIX? | Mecanismo: Gonadotropin-releasing hormone receptor antagonist; diana/simbolo: GNRHR | Exactitud, completitud por campos, alucinaciones, trazabilidad |
| Recuperacion de entidades | `egfr_target_drugs` | ¿Que farmacos tienen como target aprobado EGFR? | 17 entidades: AFATINIB DIMALEATE, AMIVANTAMAB, BRIGATINIB, CETUXIMAB, DACOMITINIB, ERLOTINIB HYDROCHLORIDE, GEFITINIB, LAPATINIB DITOSYLATE, MOBOCERTINIB, MOBOCERTINIB SUCCINATE, NECITUMUMAB, NERATINIB MALEATE, OLMUTINIB, OSIMERTINIB, OSIMERTINIB MESYLATE, PANITUMUMAB, VANDETANIB | Exactitud de conjunto, precision, recall, F1, alucinaciones, trazabilidad |

Nota: `NECITUMUMAB` es el valor presente en el grafo RDF local.

## Metricas y reglas de calculo

- Exactitud factual: `1` si el resultado principal coincide con la referencia; `0` en caso contrario.
- Exactitud por distribucion: `1` si todos los pares categoria-valor coinciden exactamente con la referencia y no hay categorias adicionales; `0` en caso contrario.
- Exactitud numerica: `1` si el entero devuelto coincide con el entero esperado; `0` en caso contrario.
- Exactitud de conjunto: `1` si el conjunto de entidades devuelto coincide exactamente con el conjunto esperado; `0` en caso contrario.
- Precision de entidades: `entidades_correctas / entidades_devueltas`.
- Recall de entidades: `entidades_correctas / entidades_esperadas`.
- F1: `2 * precision * recall / (precision + recall)`. Si precision y recall son `0`, F1 es `0`.
- Completitud: proporcion de campos o categorias esperadas que aparecen correctamente. Para ABARELIX hay dos campos principales: mecanismo y diana; para distribuciones puede calcularse como categorias correctas entre categorias esperadas.
- Alucinacion: numero de entidades, mecanismos, clases, propiedades o relaciones afirmadas que no aparecen en la referencia.
- Trazabilidad: `1` si hay SPARQL ejecutada y resultados estructurados en `semantic_agent`, o evidencia/contexto recuperado en `graph_rag`; `0` si falta la evidencia verificable. El baseline obtiene `0` por diseno.
- Eficiencia: latencia total en milisegundos y, para el agente, numero de pasos. Tokens/coste se registran solo si el proveedor devuelve esa informacion.

Antes de puntuar se normalizan las respuestas: se ignoran diferencias de mayusculas, tildes y espacios; los conteos se extraen como enteros; y las listas de entidades se comparan como conjuntos salvo que una pregunta exija orden.

## Protocolo de ejecucion

1. Usar el mismo `OPENAI_MODEL` para ambos sistemas y `temperature=0`.
2. Ejecutar cada pregunta 3 veces por sistema: 4 preguntas x 3 sistemas x 3 repeticiones = 36 ejecuciones.
3. Para el agente, registrar pregunta, respuesta, SPARQL, resultados crudos, fases, pasos y latencia.
4. Para el baseline, registrar pregunta, respuesta textual y latencia.
5. Para GraphRAG, registrar pregunta, respuesta, evidencia/resultados recuperados, pasos si existen y latencia.
6. Evaluar cada salida contra la referencia de `questions.json`.
7. Completar `results_template.csv` y calcular una tabla agregada con medias por sistema.

## SPARQL de referencia por tipo de prueba

### Distribucion por categoria: tipo de farmaco

```sparql
PREFIX : <https://example.org/farmacos-aprobados/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?type (COUNT(DISTINCT ?drug) AS ?n)
WHERE {
  ?drug a :Drug ;
        :hasDrugType ?drug_type .
  ?drug_type rdfs:label ?type .
}
GROUP BY ?type
ORDER BY DESC(?n)
```

### Conteo simple: farmacos indicados para diabetes mellitus

```sparql
PREFIX : <https://example.org/farmacos-aprobados/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT (COUNT(DISTINCT ?drug) AS ?n)
WHERE {
  ?drug a :Drug ;
        :hasIndication/rdfs:label ?indication .
  FILTER(LCASE(STR(?indication)) = "diabetes mellitus")
}
```

### Extraccion de atributos: mecanismo y diana de ABARELIX

```sparql
PREFIX : <https://example.org/farmacos-aprobados/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?drug ?mechanism ?target ?approved_symbol
WHERE {
  ?drug_uri a :Drug ;
            rdfs:label ?drug ;
            :hasInteraction ?interaction .
  FILTER(LCASE(STR(?drug)) = "abarelix")
  OPTIONAL { ?interaction :hasMechanismOfAction/rdfs:label ?mechanism . }
  OPTIONAL {
    ?interaction :hasTarget ?target_uri .
    ?target_uri rdfs:label ?target ;
                :hasApprovedSymbol ?approved_symbol .
  }
}
ORDER BY ?mechanism ?target
```

### Recuperacion de entidades: farmacos con target aprobado EGFR

```sparql
PREFIX : <https://example.org/farmacos-aprobados/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?drug
WHERE {
  ?drug_uri a :Drug ;
            rdfs:label ?drug ;
            :hasInteraction/:hasTarget ?target .
  ?target :hasApprovedSymbol "EGFR" .
}
ORDER BY ?drug
```

## Tabla agregada recomendada

| Sistema | Exactitud media | Precision media | Recall medio | F1 medio | Completitud media | Alucinaciones medias | Trazabilidad media | Latencia media ms | Pasos medios |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `semantic_agent` |  |  |  |  |  |  |  |  |  |
| `base_model` |  |  |  |  |  |  |  |  |  |
| `graph_rag` |  |  |  |  |  |  |  |  |  |

## Criterio de interpretacion

La capa semantica se considera efectiva si el agente obtiene mayor exactitud/F1 y menor alucinacion que el baseline, manteniendo trazabilidad completa. GraphRAG permite contrastar si una arquitectura de recuperacion sobre grafo Neo4j ofrece una mejora comparable o complementaria. Una latencia mayor es aceptable si el incremento de precision y verificabilidad compensa el coste operativo para el caso de uso del TFM.
