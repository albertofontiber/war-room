# Fontiber War Room — Instrucciones de desarrollo

Revisado: **2026-10-24**, tras pasiva transversal y el filtro de actividades combinables.

Convenciones vigentes para cualquier colaborador. Consultar [README](README.md), [estado actual](docs/PROJECT_STATUS.md), [arquitectura](docs/ARCHITECTURE.md), [operación](docs/OPERATIONS.md) y [trabajo abierto](docs/ROADMAP.md). Los recuentos, versiones exactas y resultados de verificación pertenecen al estado fechado; no duplicarlos aquí.

## 1. Producto y límites

Dashboard interno M&A de Fontiber para PCI y seguridad electrónica en España. War Room y portal de finders comparten código, base de datos y despliegue. El War Room es la fuente de verdad del CRM; la integración con Pipedrive está retirada.

El universo incluye empresas independientes y de grupos, con diferentes situaciones legales. `enPerimetro` expresa el criterio de inversión: no equivale a estado legal, sector, pertenencia a grupo o presencia en el CRM.

La ampliación a protección pasiva se centra en instaladoras/aplicadoras, incluidas empresas existentes que también hacen pasiva. El diseño y la evidencia están en [Protección pasiva](docs/PROTECCION_PASIVA.md). No crear una empresa por cada marca, delegación o web regional.

## 2. Mapa del código

| Área | Archivos principales |
|---|---|
| Dashboard y navegación | `src/components/WarRoomLayout.tsx`, `src/lib/navegacion.ts`, `src/lib/navegacion-url.ts` |
| Mapa | `src/components/MapaEspana.tsx`, `src/components/mapa/` |
| Tabla y ficha | `src/components/TablaEmpresas.tsx`, `src/components/PanelEmpresa.tsx`, `src/components/panel-empresa/` |
| Operaciones BORME | `src/components/OperacionesBorme.tsx`, `src/components/operaciones/`, `src/lib/borme*.ts` |
| CRM | `src/lib/crm.ts`, `src/lib/crm-stage.ts`, `src/lib/timeline.ts`, `src/lib/validation.ts` |
| Finders | `src/app/portal/`, `src/app/api/portal/`, `src/lib/finder-session.ts`, `src/lib/finder-access-log.ts` |
| Usuarios y cuenta | `src/app/usuarios/`, `src/app/cuenta/`, `src/lib/admin-users.ts`, `src/lib/auth.ts` |
| Chat | `src/app/api/chat/route.ts`, `src/lib/chat-tools/`, `src/lib/chat-schema.ts`, `src/lib/chat-db.ts` |
| Estado y cuentas SABI | `src/lib/empresa-estado.ts`, `src/lib/sabi-financieros.ts`, `scripts/import-sabi-financieros.ts` |
| Registros | `src/lib/cepreven/`, `src/lib/ripci/`, `src/lib/registros/` |
| Protección pasiva | `src/lib/pasiva.ts`, `src/lib/pasiva-import.ts`, `scripts/import-pasiva.ts`, `docs/research/` |
| Integraciones | `src/lib/graph-auth.ts`, `src/lib/email-task-matcher.ts`, `src/lib/calendar-task-matcher.ts`, `src/lib/onedrive.ts` |
| Refresco cliente | `src/lib/data-events.ts`, `src/store/useWarRoomStore.ts` |
| Datos y operación | `prisma/schema.prisma`, `prisma/migrations/`, `src/lib/cron-runs.ts`, `src/lib/logger.ts` |

Verificar las rutas concretas en el árbol antes de copiar ejemplos. Los scripts puntuales antiguos están en `scripts/archive/`; no ejecutarlos como mantenimiento recurrente.

## 3. Navegación, datos y UI

- Las vistas principales viven en `/`: `/?vista=tabla`, `/?vista=operaciones` y `/?vista=grupos`; mapa es `/`. Construir enlaces con `hrefVista()`. `/operaciones` y `/tabla` no son páginas.
- Vista, empresa seleccionada y pestaña de Operaciones se conservan en la URL mediante `useNavegacion`. La UI de Operaciones ofrece **Señales M&A** y **Alertas personas**; los tipos de la antigua Actividad reciente están integrados en Señales.
- Las rutas API de datos usan `export const dynamic = "force-dynamic"`. No añadir caché HTTP positiva a listas que se puedan mutar desde la UI.
- Tras una mutación cliente exitosa, usar `dispatchDataChanged({ resource, resourceId, action, source, parent? })`. Las listas se suscriben con `subscribeDataChanged`. Para tareas, notas y otras entidades anidadas, incluir la empresa en `parent`.
- Conservar controles de carga, error y confirmación de persistencia. No cerrar un formulario dando por guardado un cambio que el servidor no ha confirmado.
- La UI financiera usa **GM / GM%**. Los identificadores internos siguen siendo `margenBruto` / `margenBrutoPct`.
- Las fuentes Tailwind referencian las variables de `next/font`, no los nombres literales de sus familias.
- Consultar [Responsive](docs/RESPONSIVE.md) antes de cambiar breakpoints, inputs o comportamiento del teclado móvil.

## 4. CRM y autoría

Fuente única de etapas, colores y etiquetas: `src/lib/crm.ts`.

```text
identificado → contactado → primera_reunion → analisis → LOI enviada → execution → portfolio
Laterales: on_hold, muerto
```

- **Sin CRM** es ausencia de etapa; no es `identificado`. Usar `SIN_CRM_SENTINEL` en filtros.
- `Tarea` unifica pendientes y actividad realizada (`completada`, `completadaAt`, `resultado`). No reintroducir el antiguo modelo de actividad en nuevos flujos.
- Autor admin y autor finder son alternativas; conservar la atribución y la auditoría. Las notas tienen respuestas y menciones.
- Una tarea pendiente sin asignado pertenece a su autor a efectos del digest. Una tarea asignada a finder no se incluye en el digest de admins. Las creadas por integraciones sin autor ni asignado no se atribuyen artificialmente.
- Mover tareas de empresa debe respetar el acceso del finder: si no aporta el target destino, se retira su asignación.
- Los leads anónimos solo aparecen en el pipeline. `esAnonima=true` y CIF placeholder no constituyen una empresa oficial. Al vincularlos, se trasladan las relaciones al target real y prevalece el CRM del lead.
- Los cambios relevantes registran `CrmLog` y/o `AuditLog` según la operación. La carpeta OneDrive y la página Notion se vinculan o crean mediante los helpers existentes.

## 5. Autenticación y confidencialidad

- NextAuth tiene providers `admin-credentials` y `finder-credentials`; `session.kind` separa ambas zonas.
- El equipo accede mediante `User` activo, email y hash bcrypt. Los dos usuarios originales conservan fallback de entorno hasta fijar una contraseña propia. Las nuevas cuentas se invitan desde `/usuarios`.
- La sesión admin revalida en base de datos que el usuario siga activo. La recuperación y las invitaciones utilizan tokens de un solo uso; no exponer hashes ni tokens al cliente, logs o chat.
- `Finder.active` y `Finder.sessionVersion` se revalidan con los helpers de sesión. Cambiar contraseña o revocar sesiones invalida los JWT anteriores. Las páginas protegidas del portal también ejecutan el guard del servidor.
- El middleware reconoce el portal por host y por `/portal/*` / `/api/portal/*`. No sustituye a la autorización en cada endpoint.
- Tras login, preservar el destino con `urlLogin()` y validarlo con `destinoTrasLogin()`. Solo se admiten rutas de la propia zona; no dominios externos, APIs o bucles al login.
- Una página pública nueva del War Room debe añadirse a `WARROOM_PUBLIC_PAGES`. `/daily/[fecha]` es público deliberadamente.

### Reglas del portal

1. Fichas y actividad de targets: exigir `finderSourceId === finder.id` y `esAnonima=false`.
2. Ocultar financieros, grupo, owner admin, BORME, CrmLog, comisión y etapa interna. Mostrar los estados agregados de `FINDER_STATUS_MAP`; compartir notas admin solo con `visibleAFinder=true`.
3. El autocomplete de propuestas devuelve nombre y CIF de empresas no anónimas; no confundir esta excepción con la ficha, donde no se muestra CIF. No revelar seguimiento, perímetro, propietarios o duplicados internos.
4. Las propuestas siempre se reciben con respuesta neutra. La revisión de duplicados corresponde al admin; el finder ve `DUPLICATE` como «Cerrada».
5. Editar/borrar contenido propio solo dentro de 24 horas. Completar una tarea propia o asignada tiene reglas independientes y no ese límite temporal. Usar los helpers existentes.
6. Registrar acciones en `FinderAccessLog`. En login, esperar la escritura del log para que el cierre de una función serverless no la pierda.

## 6. Universo, estados y financieros

- `Empresa.cif` es único. Priorizar CIF para cruzar fuentes; nombre y web sirven para revisar candidatos, no para fusionar automáticamente entidades distintas.
- Las altas ordinarias proceden de fuentes verificadas. Para la nueva prospección de pasiva, conservar identidad y evidencia antes de incorporarla; una mención en un directorio es un candidato, no una habilitación industrial.
- Los sectores actuales son `PCI`, `seguridad_electronica` y `mixto`; este último combina PCI y seguridad electrónica. No reutilizarlo para «activa + pasiva».
- El filtro visible usa actividades combinables: **PCI activa**, **PCI pasiva** y **Seguridad electrónica**, con modos todas/cualquiera. Criterio confirmado por Alberto el 24/10: el universo previo PCI/mixto acredita activa. Las altas `investigacion_pasiva_*` no la reciben por su sector de compatibilidad; un RIPCI válido sí la acredita. Derivar con `src/lib/actividades.ts`, sin duplicar la lógica en cada API. Ver [Actividades](docs/ACTIVIDADES.md).
- `enPerimetro` y el CRM no se deben alterar por descubrir una nueva actividad. El origen de una empresa tampoco debe perderse al enriquecerla.
- Pasiva es transversal: `proteccionPasiva=true/false/null` significa confirmada/revisión negativa/sin revisar. Conservar servicios, evidencia y fecha en sus campos propios; no inferir calificación Cepreven ni habilitación. El importador solo completa datos de identidad/localización vacíos si la fila lo pide expresamente y aporta fuente fiscal primaria. Las altas de prospección quedan fuera de perímetro y sin estado SABI hasta evaluarlas.
- `estado` / `estadoAt` reflejan la consulta SABI. Nueve estados definidos en `empresa-estado.ts`; `null` significa sin consultar. «No encontrada en SABI» no significa inactiva.
- Empresas disueltas o en otras situaciones siguen en el universo. El filtro de estado incluye «Sin consultar en SABI».
- La importación SABI guarda estado de todas las empresas cruzadas; solo carga cuentas de activas y activas en concurso. Los años íntegramente vacíos/cero se omiten y los valores ausentes no pisan cifras previas.
- `ingresos` representa importe neto de la cifra de negocios; `margenBruto`, Resultado bruto SABI. No usar la columna auxiliar «MB» del Excel. Convertir miles de euros a euros.
- La limpieza de cuentas `informa_2026` no sustituidas por SABI responde a la decisión del 23/10/2026 de retirar «Ingresos de explotación»; no generalizarla a otras fuentes.
- El importador simula por defecto; la escritura exige `--apply` y se hace en una transacción. Consultar [Operación](docs/OPERATIONS.md).

## 7. BORME, normalización y registros

- El cron BORME procesa la fecha del día en curso. La fecha programada se define en UTC; no copiar horas locales fijas entre verano e invierno.
- La clasificación incluye fusión, adquisición, posible adquisición, denominación, nombramientos, disolución y otros. No tratar un cese/revocación sin nombramiento como incorporación de administrador.
- `GRUPOS_SENALES` y sus alias están en `borme-senales.ts`. Una coincidencia es una señal, no prueba suficiente para mover silenciosamente la empresa a un grupo.
- La ficha no guarda fecha de incorporación al grupo. `grupo-movimientos.ts` reconstruye evidencia BORME, separando entradas fechadas, dudosas y miembros sin fecha conocida.
- Usar `normalizePersona()` para claves de personas, `normText()` para búsqueda textual y `bormePersonaToCargoKey()` para pasar del formato BORME a PersonaCargo. No intercambiarlos.
- Personas físicas: tokens normalizados y ordenados; jurídicas: quitar forma social sin reordenar. Conservar nombre original y procedencia.
- En el mapa, el anillo BORME corresponde a señales M&A recientes y solo a empresas que pasan el filtro. Conservar jitter determinista por CIF, orden de capas e imágenes de clusters al reutilizar Mapbox.
- Cepreven asociada y Cepreven calificada no son equivalentes. Las áreas tienen familia y código; `PAS-COMP`, `PAS-REAC` y `PAS-ESTR` son las áreas de instalación de pasiva ya representables.
- RIPCI, habilitaciones de seguridad privada y calificación Cepreven son datos diferentes. No inferir una autorización desde el sector. La derivación de activa del universo previo sigue el criterio de Alberto documentado en Actividades; no extenderla a las altas de pasiva.

## 8. Chat e integraciones

- `src/lib/chat-tools/index.ts` compone las doce herramientas actuales. Si se añade una: documentarla en `chat-schema.ts`; si escribe, mapear su recurso para el refresco del cliente y conservar autoría/auditoría.
- `execute_sql` utiliza `getChatDb()` y `CHAT_READONLY_DATABASE_URL`, con rol Postgres de lectura y timeout. El guard SQL es una segunda barrera, no un sustituto de permisos. El código conserva fallback al cliente normal si falta la variable: revisar la configuración de cada entorno.
- No dar acceso del chat a tokens, `ChatThread` o hashes. En `User` y `Finder` seleccionar columnas explícitas. Revisar los grants al añadir columnas.
- `WITH` está permitido dentro de una única consulta de lectura. Indicar truncamiento de resultados; serializar BigInt de forma segura.
- Sin periodo especificado, contestar sobre el histórico disponible indicando su alcance. La fecha de la conversación se añade por petición, fuera del bloque estático cacheado.
- El chat conserva el hilo por usuario. Se autentica como admin; los tools de tareas/contactos/etapas reciben el usuario actual.
- Microsoft Graph ingesta correo saliente y entrante de contactos, y eventos de calendario. Los eventos recurrentes se tratan como serie, no una tarea por ocurrencia. Deduplicar por identificadores de origen y conservar ediciones manuales de tareas.
- Inicializar Resend dentro de las funciones de envío. Los remitentes y las URLs se configuran por entorno; no copiar secretos a documentación.

## 9. Desarrollo, migraciones y comprobaciones

- Seguir [Operación](docs/OPERATIONS.md) para migraciones versionadas. No usar `prisma db push` en producción. La CI comprueba que las migraciones reproducen el esquema.
- Tablas nuevas en `public`: activar RLS y revisar privilegios de la Data API en la misma migración. La aplicación accede con Prisma en servidor.
- Usar `src/lib/logger.ts` para logs operativos; nunca cuerpos de correo, tokens o errores crudos de proveedores en `CronRun`.
- Verificación habitual: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, proporcionada al cambio. Cambios de imports, client components o routing requieren build antes de push.
- No ejecutar scripts de backfill/reclasificación/migración histórica sin un motivo actual. Los scripts quedan fuera del typecheck principal: revisar y verificar explícitamente los que se modifiquen.
- Actualizar los documentos afectados por cambios de arquitectura, fuentes o modelo de datos. Registrar evidencia y fecha; no convertir automáticamente una idea de un documento antiguo en trabajo pendiente.
