# scripts/archive/

Scripts one-off ya ejecutados. Se conservan por traza histórica pero no
deberían volver a correrse salvo incidentes puntuales. Si necesitas rehacer
uno, verifica antes que la lógica sigue siendo correcta contra el schema
actual: pueden hacer referencia a columnas/tablas que han cambiado.

## Cómo decidir si archivar un script nuevo

Un script se archiva cuando:
- Ya se ejecutó y registró en `instructions.md` como EJECUTADO con fecha.
- Es una migración/backfill de un hito concreto (import Excel, reclasificación, etc.).
- Sus outputs `.json` son intermedios (listados de webs validados, etc.).

Los scripts recurrentes (testing BORME, sync Pipedrive manual, diagnóstico
de cambios CRM, búsqueda de empresas) se quedan en `scripts/`.
