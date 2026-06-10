# Indices de entidades y valores frecuentes

Este archivo no lista todas las entidades del grafo. Resume las entidades y valores que ayudan al agente a resolver preguntas frecuentes y a construir SPARQL correcta. Para obtener resultados completos, siempre ejecutar SPARQL.

## DrugType

| Label | Conteo de farmacos |
| --- | ---: |
| Small molecule | 1440 |
| Protein | 162 |
| Antibody | 106 |
| Unknown | 21 |
| Oligonucleotide | 19 |
| Antibody drug conjugate | 13 |
| Gene | 10 |
| Enzyme | 7 |
| Oligosaccharide | 6 |
| Cell | 2 |

## Indicaciones frecuentes

| Label | Conteo de farmacos |
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
| major depressive disorder | 44 |
| myocardial infarction | 43 |
| migraine disorder | 42 |
| epilepsy | 42 |
| type 2 diabetes mellitus | 42 |
| immune system disease | 41 |
| psychosis | 41 |
| Nasal congestion | 41 |
| heart failure | 40 |
| seasonal allergic rhinitis | 40 |

## TargetClass frecuentes

| Label | Targets |
| --- | ---: |
| Enzyme | 100 |
| Membrane receptor | 76 |
| Secreted protein | 29 |
| Unclassified protein | 28 |
| Transporter | 17 |
| Ion channel | 15 |
| Enzyme, Unclassified protein | 10 |
| Other cytosolic protein | 9 |
| Transcription factor | 8 |
| Surface antigen | 6 |

## Entidades del protocolo experimental

### ABARELIX

- Tipo RDF: `:Drug`.
- Label: `ABARELIX`.
- Uso esperado: buscar con `FILTER(LCASE(STR(?drug)) = "abarelix")`.
- Mecanismo esperado: `Gonadotropin-releasing hormone receptor antagonist`.
- Target aprobado esperado: `GNRHR`.
- Patron recomendado: farmaco -> `:hasInteraction` -> `:hasMechanismOfAction` y `:hasTarget`.

### diabetes mellitus

- Tipo RDF: `:Indication`.
- Label: `diabetes mellitus`.
- Uso esperado: buscar con `:hasIndication/rdfs:label ?indication`.
- Comparacion recomendada: `FILTER(LCASE(STR(?indication)) = "diabetes mellitus")`.
- Conteo esperado: 63 farmacos distintos.

### EGFR

- Tipo RDF: `:Target`.
- Uso esperado: buscar target aprobado con `:hasApprovedSymbol "EGFR"`.
- No depender solo de `rdfs:label` si la pregunta dice "target aprobado".
- Conteo esperado de farmacos con target aprobado EGFR: 17.

Farmacos esperados para EGFR:

- `AFATINIB DIMALEATE`
- `AMIVANTAMAB`
- `BRIGATINIB`
- `CETUXIMAB`
- `DACOMITINIB`
- `ERLOTINIB HYDROCHLORIDE`
- `GEFITINIB`
- `LAPATINIB DITOSYLATE`
- `MOBOCERTINIB`
- `MOBOCERTINIB SUCCINATE`
- `NECITUMUMAB`
- `NERATINIB MALEATE`
- `OLMUTINIB`
- `OSIMERTINIB`
- `OSIMERTINIB MESYLATE`
- `PANITUMUMAB`
- `VANDETANIB`

## Ejemplos de farmacos y nombres comerciales

| Farmaco | Trade names | Indicaciones de ejemplo | Target aprobado de ejemplo |
| --- | --- | --- | --- |
| `.ALPHA.1-PROTEINASE INHIBITOR HUMAN` | Respreeza | genetic disorder, hemorrhage, lung disease | ELANE |
| `ABALOPARATIDE` | Eladynos, Tymlos | osteoporosis, postmenopausal osteoporosis | PTH1R |
| `ABARELIX` | Plenaxis | neoplasm | GNRHR |

## Entidades por tipo: como consultarlas

- `:Drug`: label en `rdfs:label`, nombre original en `:prefNameLiteral`.
- `:TradeName`: label en `rdfs:label`, alias en `skos:altLabel`, literal original en `:tradeNameLiteral`.
- `:Indication`: label en `rdfs:label`.
- `:Target`: label principal en `rdfs:label`, simbolo aprobado en `:hasApprovedSymbol`, nombre largo en `skos:altLabel`.
- `:MechanismOfAction`: label en `rdfs:label`.
- `:TargetClass`: label en `rdfs:label`.

## Normalizacion recomendada

- Para labels escritos por el usuario, usar `LCASE(STR(?label)) = "valor normalizado"`.
- Para simbolos aprobados como `EGFR`, `GNRHR`, `PTH1R`, puede usarse coincidencia exacta sobre `:hasApprovedSymbol`.
- Para listas de entidades, devolver labels ordenados con `ORDER BY`.
- Para valores textuales originales de la fila CSV, consultar `:DatasetRow` solo cuando la pregunta pida trazabilidad o evidencia.
