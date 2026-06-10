# Catalogo semantico persistente

Este directorio contiene una vista semantica persistente de la ontologia de farmacos aprobados. Esta pensado para que el agente lo consulte antes de construir SPARQL, siguiendo la idea de usar una capa semantica legible en vez de muchas herramientas granulares.

El catalogo no se genera al arrancar la aplicacion. Es un artefacto versionado y debe actualizarse explicitamente cuando cambien los RDF de `knowledge/ontology/` o `knowledge/data/`.

## Archivos

- `overview.md`: resumen del dominio, tamano del grafo y relaciones principales.
- `schema.md`: clases, propiedades, dominio/rango, conteos y ejemplos.
- `query_patterns.md`: patrones SPARQL validados para preguntas frecuentes del experimento.
- `entity_indexes.md`: indices compactos de entidades y valores frecuentes.
- `catalog.json`: version estructurada para lectura programatica.

## Regla de uso para el agente

1. Lee primero `overview` o `query_patterns` con `read_semantic_catalog`.
2. Usa el catalogo para identificar clases, propiedades, prefijos y patrones de consulta.
3. Usa herramientas RDF granulares solo si el catalogo no resuelve una ambiguedad.
4. Ejecuta siempre la SPARQL final en Fuseki.
5. Redacta la respuesta final solo con datos presentes en los resultados SPARQL.

El catalogo es contexto operativo. La fuente factual final sigue siendo el grafo RDF consultado mediante SPARQL.
