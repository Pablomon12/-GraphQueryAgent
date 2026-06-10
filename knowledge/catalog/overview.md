# Overview del dominio RDF

Fecha de revision del catalogo: 2026-06-03.

Este catalogo describe la ontologia local de farmacos aprobados usada por `semantic_agent`. La fuente de verdad son:

- `knowledge/ontology/farmacos_aprobados.ttl`
- `knowledge/data/farm_aprobados_inst.ttl`

El grafo cargado contiene 89.434 triples. Representa farmacos aprobados, tipos de farmaco, nombres comerciales, indicaciones terapeuticas, targets biologicos, clases de target, mecanismos de accion, interacciones farmaco-target y filas de origen del dataset.

## Prefijos principales

```sparql
PREFIX : <https://example.org/farmacos-aprobados/ontology#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
```

## Clases y conteos

| Clase | Conteo | Funcion |
| --- | ---: | --- |
| `:Drug` | 1.786 | Farmaco o sustancia activa aprobada, identificada por `rdfs:label` y `:prefNameLiteral`. |
| `:DrugType` | 10 | Naturaleza del farmaco, por ejemplo `Small molecule`, `Protein` o `Antibody`. |
| `:TradeName` | 7.723 | Nombre comercial asociado a un farmaco. |
| `:Indication` | 796 | Indicacion terapeutica o uso aprobado. |
| `:Target` | 890 | Target biologico referenciado por el dataset. |
| `:TargetClass` | 29 | Categoria funcional asignada a un target. |
| `:MechanismOfAction` | 650 | Mecanismo de accion declarado en los datos. |
| `:DrugTargetInteraction` | 1.786 | Asercion de interaccion que conecta un farmaco con targets y mecanismos. |
| `:DatasetRow` | 1.786 | Fila de origen del CSV para trazabilidad. |

## Modelo conceptual

La unidad principal es `:Drug`. Cada farmaco puede tener:

- un tipo mediante `:hasDrugType`;
- uno o varios nombres comerciales mediante `:hasTradeName`;
- una o varias indicaciones mediante `:hasIndication`;
- una interaccion mediante `:hasInteraction`.

La interaccion `:DrugTargetInteraction` conecta el farmaco con:

- targets mediante `:hasTarget`;
- mecanismos de accion mediante `:hasMechanismOfAction`;
- textos conservadores de origen mediante `:targetNameText`, `:targetClassText` y `:mechanismText`;
- una fila de origen mediante `:sourceRow`.

El target `:Target` puede tener:

- label principal en `rdfs:label`, normalmente el simbolo aprobado;
- simbolo aprobado en `:hasApprovedSymbol`;
- alias o nombre largo en `skos:altLabel`;
- clase funcional mediante `:hasTargetClass`.

## Relaciones centrales

```text
:Drug
  -> :hasDrugType -> :DrugType
  -> :hasTradeName -> :TradeName
  -> :hasIndication -> :Indication
  -> :hasInteraction -> :DrugTargetInteraction

:DrugTargetInteraction
  -> :hasTarget -> :Target
  -> :hasMechanismOfAction -> :MechanismOfAction
  -> :sourceRow -> :DatasetRow

:Target
  -> :hasTargetClass -> :TargetClass
```

## Reglas de interpretacion

- Para identificar farmacos, usa `?drug a :Drug ; rdfs:label ?drug_label`.
- Para buscar un farmaco concreto, compara `LCASE(STR(?drug_label))`.
- Para targets aprobados, usa `:hasApprovedSymbol`; para nombre largo del target, usa `skos:altLabel`.
- Para indicaciones, usa `:hasIndication/rdfs:label`.
- Para mecanismos de accion, navega por `:hasInteraction/:hasMechanismOfAction/rdfs:label`.
- Para targets de un farmaco, navega por `:hasInteraction/:hasTarget`.
- Para preguntas cuantitativas, usa `COUNT(DISTINCT ...)`.
- Para listas de entidades, usa `SELECT DISTINCT` y `ORDER BY`.
- El catalogo orienta la consulta, pero la respuesta final debe salir de los resultados de `run_sparql`.

## Valores frecuentes

Distribucion por tipo de farmaco:

| Tipo | Farmacos |
| --- | ---: |
| Small molecule | 1.440 |
| Protein | 162 |
| Antibody | 106 |
| Unknown | 21 |
| Oligonucleotide | 19 |
| Antibody drug conjugate | 13 |
| Gene | 10 |
| Enzyme | 7 |
| Oligosaccharide | 6 |
| Cell | 2 |

Indicaciones frecuentes:

| Indicacion | Farmacos |
| --- | ---: |
| neoplasm | 223 |
| cardiovascular disease | 152 |
| hypertension | 90 |
| Pain | 85 |
| diabetes mellitus | 63 |
| rheumatoid arthritis | 54 |
| allergic disease | 51 |
| Recurrent thrombophlebitis | 49 |
| asthma | 48 |
| Airway obstruction | 46 |

Clases de target frecuentes:

| Clase de target | Targets |
| --- | ---: |
| Enzyme | 100 |
| Membrane receptor | 76 |
| Secreted protein | 29 |
| Unclassified protein | 28 |
| Transporter | 17 |
| Ion channel | 15 |

## Ejemplos clave del experimento

- `ABARELIX` es un `:Drug`; su mecanismo esperado es `Gonadotropin-releasing hormone receptor antagonist`; su target aprobado esperado es `GNRHR`.
- `EGFR` debe buscarse como `:Target :hasApprovedSymbol "EGFR"`.
- `diabetes mellitus` es una indicacion con 63 farmacos distintos.
- La distribucion por `:DrugType` debe agruparse por label del tipo y contar farmacos distintos.
