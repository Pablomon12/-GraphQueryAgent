# Mapeo CSV -> ontología

## Archivos generados

- `farmacos_aprobados_ontology.ttl`: esquema OWL 2 en Turtle.
- `farmacos_aprobados_instances.ttl`: instancias generadas desde `farmacos_aprobados.csv`.
- `generate_farmacos_ontology.py`: generador reproducible de ambos artefactos.

## Criterios de modelado

- `prefName` se modela como instancia de `:Drug`.
- `drugType` se modela como instancia de `:DrugType` enlazada con `:hasDrugType`.
- `tradeNames` se modela como instancias de `:TradeName` enlazadas con `:hasTradeName`.
- `label` se modela como instancias de `:Indication` enlazadas con `:hasIndication`.
- Cada fila del CSV genera una instancia de `:DatasetRow` para trazabilidad.
- Cada fila del CSV genera una instancia de `:DrugTargetInteraction` enlazada con `:sourceRow`.
- `approvedSymbol` se usa como base principal para crear instancias de `:Target`.
- `mechanismOfAction` se modela como instancias de `:MechanismOfAction` enlazadas a `:DrugTargetInteraction`.

## Tratamiento de ambigüedades

- El dataset contiene muchas filas donde `targetName`, `approvedSymbol`, `targetClass` y `mechanismOfAction` no guardan correspondencia posicional exacta.
- Para no introducir relaciones falsas, el generador conserva siempre el literal original de esas columnas en `:DatasetRow`.
- Además, la interacción guarda `:targetNameText`, `:targetClassText` y `:mechanismText` como soporte de consulta textual.
- Solo cuando la cardinalidad es segura se asigna `:hasTargetClass` directamente al `:Target`.
- Cuando hay un único símbolo aprobado, el nombre de diana y la clase se consideran atribuibles a ese mismo objetivo.

## Limitaciones conocidas

- No se reconcilian sales, variantes ni combinaciones de fármacos como la misma entidad.
- `label` no distingue entre enfermedad, indicación, síntoma o categoría clínica.
- Los símbolos aprobados se almacenan como literales en `:Target`; no se ha creado una capa separada para genes o proteínas.
