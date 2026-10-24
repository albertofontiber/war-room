# Trabajo abierto y decisiones por priorizar

Revisado: **2026-10-24**. Una función ausente del código no constituye por sí sola un encargo ni una prioridad aprobada.

## Encargo actual

**Ampliar el universo a instaladoras y aplicadoras de protección pasiva en España**, incluyendo empresas existentes que también prestan ese servicio. Petición de Alberto del 23/10/2026; ejemplos: Control Ignífugo, Plasfoc y Naes 2014.

La clasificación transversal, la migración y el importador están entregados en #192. El 24/10 se revisaron las **84 candidatas pendientes**, se rastrearon **3.184 dominios** y se aplicaron **106 enriquecimientos y 9 altas**: 184 sociedades confirmadas en total. La revisión inicial de pendientes y el primer barrido general de webs están realizados; los casos no confirmados tienen motivo y fuentes en el [seguimiento actualizado](research/pasiva-seguimiento-2026-10-24.json). No se arrastra la antigua tarea genérica de revisar esas 84 sin indicar el resultado.

La tercera tanda, también aplicada el 24/10, añade **33 altas y 5 enriquecimientos**, hasta **222 entidades confirmadas**. Se consultaron 191 perfiles de CLÚSIC, AD’IP y AVACOI y se buscaron empresas por las 17 comunidades autónomas. El [seguimiento regional](research/pasiva-asociaciones-regiones-2026-10-24.json) documenta los 223 dominios descubiertos y el resultado de cada uno; las landings de una misma entidad no generan altas adicionales.

La cobertura sigue abierta a evidencia adicional: identidades no resueltas, webs bloqueadas o ausentes y otras redes de aplicadores. La primera búsqueda asociativa/regional ya se ha realizado; la investigación exhaustiva del mercado no está completada. La pertenencia a una asociación no determina por sí sola perímetro de inversión, estado legal o actividad exclusiva.

## Limitaciones vigentes

| Limitación | Evidencia y siguiente decisión |
|---|---|
| La cobertura de pasiva sigue siendo parcial | Barrido general y primera ampliación asociativa/regional realizados. Resolver CIF de Acusfoc/Vimat/Borja, sociedad ejecutora de Aplicanor y otros casos identificados; recuperar accesos e investigar empresas sin web. `null` no equivale a actividad descartada. |
| Discrepancia de domicilio de Blinders | CIF y actividad resueltos; se conserva Ontinyent frente al domicilio fiscal web de Badalona hasta conciliación registral. |
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
| Revisión de las 84 candidatas pendientes y primer barrido de webs del universo | Segundo lote del 24/10 aplicado y seguimiento con resultado por candidata; no implica censo completo |
| Primera ampliación por CLÚSIC, AD’IP, AVACOI y búsquedas en las 17 comunidades | Tercer lote aplicado: 33 altas y 5 enriquecimientos, con seguimiento fechado por dominio; no implica agotar las fuentes |

El eventual archivo del histórico de Pipedrive o baja de una suscripción son acciones externas cuyo estado no se deduce del repo: se retiran de la lista de pendientes técnicos. Tampoco se mantienen tickets como «si reaparece el bug», «spawn task creado» o cifras de cobertura de abril sin evidencia actual.

## Cómo cambiar esta lista

Cada nuevo encargo debe identificar objetivo, origen, resultado esperado y criterio de cierre. Al entregarse, retirarlo del trabajo abierto y enlazar su PR desde el estado o historial correspondiente. Una limitación puede seguir documentada sin convertirse automáticamente en una tarea.
