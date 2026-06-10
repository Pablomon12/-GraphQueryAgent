# Patrones SPARQL recomendados

Todos los patrones usan el prefijo principal:

```sparql
PREFIX : <https://example.org/farmacos-aprobados/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
```

## 1. Distribucion por tipo de farmaco

Pregunta tipo: "Cuantos farmacos hay por cada tipo de farmaco?"

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

Resultado esperado:

| Tipo | Conteo |
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

## 2. Conteo de farmacos por indicacion exacta

Pregunta tipo: "Cuantos farmacos estan indicados para diabetes mellitus?"

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

Resultado esperado para `diabetes mellitus`: 63.

## 3. Mecanismo y target de un farmaco

Pregunta tipo: "Que mecanismo de accion y que diana tiene ABARELIX?"

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

Resultado esperado:

- `ABARELIX`
- mecanismo: `Gonadotropin-releasing hormone receptor antagonist`
- target aprobado: `GNRHR`

## 4. Farmacos por target aprobado

Pregunta tipo: "Que farmacos tienen como target aprobado EGFR?"

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

Resultado esperado: 17 farmacos.

Entidades esperadas:

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

## 5. Buscar farmacos por nombre comercial

Pregunta tipo: "Que farmaco tiene el nombre comercial Tymlos?"

```sparql
PREFIX : <https://example.org/farmacos-aprobados/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?drug ?trade_name
WHERE {
  ?drug_uri a :Drug ;
            rdfs:label ?drug ;
            :hasTradeName ?trade .
  ?trade rdfs:label ?trade_name .
  FILTER(LCASE(STR(?trade_name)) = "tymlos")
}
ORDER BY ?drug
```

## 6. Obtener indicaciones de un farmaco

Pregunta tipo: "Para que indicaciones esta aprobado ABALOPARATIDE?"

```sparql
PREFIX : <https://example.org/farmacos-aprobados/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?drug ?indication
WHERE {
  ?drug_uri a :Drug ;
            rdfs:label ?drug ;
            :hasIndication/rdfs:label ?indication .
  FILTER(LCASE(STR(?drug)) = "abaloparatide")
}
ORDER BY ?indication
```

## 7. Targets con alias o nombre largo

Pregunta tipo: "Que simbolo aprobado corresponde a Epidermal growth factor receptor?"

```sparql
PREFIX : <https://example.org/farmacos-aprobados/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?target ?approved_symbol ?alias
WHERE {
  ?target_uri a :Target ;
              rdfs:label ?target ;
              :hasApprovedSymbol ?approved_symbol .
  OPTIONAL { ?target_uri skos:altLabel ?alias . }
  FILTER(
    LCASE(STR(?target)) = "egfr" ||
    LCASE(STR(?approved_symbol)) = "egfr" ||
    LCASE(STR(?alias)) = "epidermal growth factor receptor"
  )
}
ORDER BY ?target
```

## 8. Trazabilidad de una respuesta

Pregunta tipo: "De que fila procede la evidencia de ABARELIX?"

```sparql
PREFIX : <https://example.org/farmacos-aprobados/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?drug ?row_id ?raw_indications ?raw_target_name ?raw_symbol ?raw_mechanism
WHERE {
  ?drug_uri a :Drug ;
            rdfs:label ?drug ;
            :sourceRow ?row .
  FILTER(LCASE(STR(?drug)) = "abarelix")
  OPTIONAL { ?row :rowIdentifier ?row_id . }
  OPTIONAL { ?row :rawLabelCell ?raw_indications . }
  OPTIONAL { ?row :rawTargetNameCell ?raw_target_name . }
  OPTIONAL { ?row :rawApprovedSymbolCell ?raw_symbol . }
  OPTIONAL { ?row :rawMechanismCell ?raw_mechanism . }
}
ORDER BY ?row_id
```

## Reglas de eleccion de patron

- Si la pregunta pide "cuantos", usa `COUNT(DISTINCT ...)`.
- Si la pregunta pide "por cada", usa `GROUP BY`.
- Si la pregunta menciona "target aprobado", usa `:hasApprovedSymbol`.
- Si la pregunta menciona "diana" o "target" de un farmaco, navega por `:hasInteraction/:hasTarget`.
- Si la pregunta menciona "mecanismo", navega por `:hasInteraction/:hasMechanismOfAction`.
- Si la pregunta pide evidencia o trazabilidad, une con `:sourceRow`.
