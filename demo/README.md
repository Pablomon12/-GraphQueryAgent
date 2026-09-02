# Demo del proyecto

Archivo principal:

- `ontology-agent-demo-final.mov`

Duracion real: 209.99 segundos, aproximadamente 3 minutos y 30 segundos.

La demo muestra:

- pantalla inicial del frontend;
- estado del backend y proveedor LLM;
- pregunta libre al agente semantico;
- progreso de la consulta mediante streaming;
- SPARQL generado;
- resultados crudos en JSON;
- respuesta del agente semantico;
- comparacion con modelo base;
- comparacion con GraphRAG;
- seccion de experimento y matriz de comparacion.

Pregunta usada en la grabacion:

```text
Que dianas estan asociadas al farmaco ABALOPARATIDE?
```

Servicios usados durante la demo:

- Frontend Next.js: `http://127.0.0.1:3000`
- Backend principal: `http://127.0.0.1:8000`
- Fuseki: `http://127.0.0.1:3030`
- GraphRAG service: `http://127.0.0.1:8001`
- Neo4j: `http://127.0.0.1:7474`

Nota de entrega: el video original ocupa mas de 200 MB, por lo que no conviene
subirlo directamente al repositorio Git. Para compartirlo, es mejor comprimirlo
con QuickTime, ffmpeg o HandBrake y enlazarlo desde el README, o subirlo como
archivo externo en Drive, OneDrive, Moodle, GitHub Release u otro soporte de la
entrega.
