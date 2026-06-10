# Esquema RDF para consultas SPARQL

Este archivo resume el esquema operativo que debe usar el agente antes de construir consultas SPARQL. Los nombres tecnicos se mantienen tal como aparecen en RDF.

## Clases

| Clase | Label | Conteo | Comentario |
| --- | --- | ---: | --- |
| `:Drug` | Drug | 1.786 | Approved drug or active substance identified by prefName. |
| `:DrugType` | DrugType | 10 | Nature of the drug, such as Small molecule or Protein. |
| `:TradeName` | TradeName | 7.723 | Commercial or brand name associated with a drug. |
| `:Indication` | Indication | 796 | Therapeutic indication or approved use. |
| `:Target` | Target | 890 | Biological target referenced in the source dataset. |
| `:TargetClass` | TargetClass | 29 | Functional category assigned to a biological target. |
| `:MechanismOfAction` | MechanismOfAction | 650 | Mechanism of action asserted in the dataset. |
| `:DrugTargetInteraction` | DrugTargetInteraction | 1.786 | Interaction assertion linking a drug with targets and mechanisms. |
| `:DatasetRow` | DatasetRow | 1.786 | Source row from `farmacos_aprobados.csv` used for traceability. |

## Propiedades objeto

| Propiedad | Dominio | Rango | Triples | Uso |
| --- | --- | --- | ---: | --- |
| `:hasDrugType` | `:Drug` | `:DrugType` | 1.786 | Tipo declarado de cada farmaco. |
| `:hasTradeName` | `:Drug` | `:TradeName` | 7.802 | Nombres comerciales asociados. |
| `:hasIndication` | `:Drug` | `:Indication` | 4.959 | Indicaciones terapeuticas. |
| `:hasInteraction` | `:Drug` | `:DrugTargetInteraction` | 1.786 | Conexion desde farmaco hacia interaccion. |
| `:hasTarget` | `:DrugTargetInteraction` | `:Target` | 4.734 | Targets biologicos de la interaccion. |
| `:hasMechanismOfAction` | `:DrugTargetInteraction` | `:MechanismOfAction` | 2.359 | Mecanismos de accion asociados. |
| `:hasTargetClass` | `:Target` | `:TargetClass` | 336 | Clase funcional del target. |
| `:sourceRow` | `owl:Thing` | `:DatasetRow` | variable | Trazabilidad a la fila original. |

## Propiedades datatype

| Propiedad | Dominio | Rango | Uso |
| --- | --- | --- | --- |
| `:rowIdentifier` | `:DatasetRow` | `xsd:integer` | Identificador numerico de fila. |
| `:prefNameLiteral` | `:Drug` | `xsd:string` | Nombre preferido original del farmaco. |
| `:tradeNameLiteral` | `:TradeName` | `xsd:string` | Nombre comercial original. |
| `:hasApprovedSymbol` | `:Target` | `xsd:string` | Simbolo aprobado del target. |
| `:rawLabelCell` | `:DatasetRow` | `xsd:string` | Celda original de indicaciones. |
| `:rawTargetNameCell` | `:DatasetRow` | `xsd:string` | Celda original de nombres de target. |
| `:rawApprovedSymbolCell` | `:DatasetRow` | `xsd:string` | Celda original de simbolos aprobados. |
| `:rawTargetClassCell` | `:DatasetRow` | `xsd:string` | Celda original de clases de target. |
| `:rawMechanismCell` | `:DatasetRow` | `xsd:string` | Celda original de mecanismos. |
| `:targetNameText` | `:DrugTargetInteraction` | `xsd:string` | Texto conservador del nombre de target a nivel de interaccion. |
| `:targetClassText` | `:DrugTargetInteraction` | `xsd:string` | Texto conservador de clase de target a nivel de interaccion. |
| `:mechanismText` | `:DrugTargetInteraction` | `xsd:string` | Texto conservador de mecanismo a nivel de interaccion. |

## Patrones de navegacion

### Farmaco a tipo

```sparql
?drug a :Drug ;
      rdfs:label ?drug ;
      :hasDrugType/rdfs:label ?type .
```

### Farmaco a indicaciones

```sparql
?drug_uri a :Drug ;
          rdfs:label ?drug ;
          :hasIndication/rdfs:label ?indication .
```

### Farmaco a mecanismos

```sparql
?drug_uri a :Drug ;
          rdfs:label ?drug ;
          :hasInteraction ?interaction .
?interaction :hasMechanismOfAction/rdfs:label ?mechanism .
```

### Farmaco a targets aprobados

```sparql
?drug_uri a :Drug ;
          rdfs:label ?drug ;
          :hasInteraction/:hasTarget ?target .
?target rdfs:label ?target_label ;
        :hasApprovedSymbol ?approved_symbol .
```

### Target aprobado a farmacos

```sparql
?drug_uri a :Drug ;
          rdfs:label ?drug ;
          :hasInteraction/:hasTarget ?target .
?target :hasApprovedSymbol "EGFR" .
```

### Trazabilidad a fila de origen

```sparql
?drug_uri :sourceRow ?row .
?row :rowIdentifier ?row_id ;
     :rawLabelCell ?raw_indications ;
     :rawTargetNameCell ?raw_target_name ;
     :rawApprovedSymbolCell ?raw_symbol ;
     :rawMechanismCell ?raw_mechanism .
```

## Ejemplo real: ABARELIX

`ABARELIX` aparece como `:Drug` con label `ABARELIX`. Esta conectado con `:interaction_row_3`.

Consulta recomendada:

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

Resultado esperado por el protocolo experimental:

- `drug`: `ABARELIX`
- `mechanism`: `Gonadotropin-releasing hormone receptor antagonist`
- `target`: `GNRHR`
- `approved_symbol`: `GNRHR`

## Errores frecuentes a evitar

- No buscar targets por `rdfs:label` cuando la pregunta diga "target aprobado"; usa `:hasApprovedSymbol`.
- No responder desde el catalogo sin ejecutar SPARQL.
- No asumir que una indicacion tiene capitalizacion estable; usa `LCASE(STR(?indication))`.
- No contar filas si la pregunta pide farmacos; usa `COUNT(DISTINCT ?drug)`.
- No repetir una SPARQL fallida sin modificarla.
