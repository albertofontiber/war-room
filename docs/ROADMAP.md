# Trabajo abierto y decisiones por priorizar

Revisado: **2026-10-23**. Una función ausente del código no constituye por sí sola un encargo ni una prioridad aprobada.

## Encargo actual

**Ampliar el universo a instaladoras y aplicadoras de protección pasiva en España**, incluyendo empresas existentes que también prestan ese servicio. Petición de Alberto del 23/10/2026; ejemplos: Control Ignífugo, Plasfoc y Naes 2014.

La clasificación transversal, la migración, el importador y la primera incorporación ampliada ya están implementados y aplicados; ver [Protección pasiva](PROTECCION_PASIVA.md). El encargo abierto continúa en la cobertura del universo: resolver las identidades pendientes y ampliar búsquedas regionales y asociativas, sin limitarse a la primera tanda. El seguimiento estructurado registra los casos abiertos. La pertenencia a una asociación no determina por sí sola perímetro de inversión, estado legal o actividad exclusiva.

## Limitaciones vigentes

| Limitación | Evidencia y siguiente decisión |
|---|---|
| La cobertura de pasiva sigue siendo parcial | El atributo transversal está entregado. Revisar empresas todavía sin clasificar, resolver los casos de identidad del seguimiento y recorrer nuevas fuentes/territorios. `null` no equivale a actividad descartada. |
| Calendario recurrente se ingiere como serie | `calendar-task-matcher.ts`; una tarea por ocurrencia requeriría cambiar a `calendarView`. No está programado. |
| Falta de URL de lectura del chat provoca fallback al cliente normal | `chat-db.ts`; comprobar configuración en cada entorno nuevo. El rol fue creado y documentado en #187; no volver a listar su creación como pendiente. |

## Propuestas históricas que necesitan nueva priorización

No se presentan como tareas comprometidas ni tienen fecha objetivo:

- Scoring modular y explicable, frente al score almacenado/importado.
- Visualización en grafo de las relaciones de personas y empresas; la consulta de personas compartidas ya existe.
- Ampliar la cobertura web y validar enlaces de empresas; ya existe enriquecimiento seguro (#164), por lo que no sigue vigente el antiguo bloqueo genérico por SSL. El volumen pendiente se consulta en el corte de datos.
- Extender fuentes regionales cuando haya una necesidad concreta y revisar la cobertura real de los registros ya integrados.
- Definir una política de relectura de cargos de Empresia. Una propuesta de ejecutar en julio de 2026 no prueba que hoy haya una ejecución pendiente.

## Trabajo retirado del antiguo backlog

| Ya resuelto | Evidencia |
|---|---|
| Cut-over y retirada de Pipedrive del código y esquema | #59, #60 |
| Refactor del mapa y clusters como capa nativa | #73, #74 |
| Refactor de Operaciones, ficha y chat | #81, #82, #151 |
| Logger estructurado | #80 y `src/lib/logger.ts` |
| Zoom inicial y protección frente a terrain al desmontar | #70, #72 |
| Responsive y posteriores ajustes de teclado/viewport | #64–#71, #138–#139, #158–#159 |
| Gestión de accesos, recuperación, invitaciones y cuenta | #161, #163, #182, #184 |
| Rol de lectura del chat | #187; conservar la comprobación de configuración por entorno |
| Cuentas SABI 2025 y estado legal | #190; verificación de datos en Estado actual |
| Documentación depurada y modelo transversal de pasiva con primer lote aplicado | #191 y entrega de pasiva; detalles y casos aún abiertos en Protección pasiva |

El eventual archivo del histórico de Pipedrive o baja de una suscripción son acciones externas cuyo estado no se deduce del repo: se retiran de la lista de pendientes técnicos. Tampoco se mantienen tickets como «si reaparece el bug», «spawn task creado» o cifras de cobertura de abril sin evidencia actual.

## Cómo cambiar esta lista

Cada nuevo encargo debe identificar objetivo, origen, resultado esperado y criterio de cierre. Al entregarse, retirarlo del trabajo abierto y enlazar su PR desde el estado o historial correspondiente. Una limitación puede seguir documentada sin convertirse automáticamente en una tarea.
