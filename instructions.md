# Fontiber War Room — Instrucciones para Claude

Documento de contexto para continuar el desarrollo entre conversaciones.
Actualizado: 2026-04-25 (tras PRs #10-#21: leads anónimos + MVP 1.5 portal finders + cleanup + ajustes UI)

---

## 1. Qué es este proyecto

**War Room** es un dashboard interno de M&A para Fontiber, orientado al sector de PCI (protección contra incendios) y seguridad electrónica en España.

- Universo actual: **~5.140 empresas** (PCI + seg. electrónica + mixtas)
- Stack: Next.js 14 App Router · TypeScript · Prisma · PostgreSQL (Supabase) · Zustand · react-map-gl / Mapbox GL JS · Tailwind CSS · Vercel AI SDK + Claude · bcryptjs (auth finders)
- Tema visual: oscuro, estilo "war room"
- **Dos apps bajo un solo deployment**:
  - **War room** (admins Alberto/Gabriel) → `https://warroom.fontiber.com`
  - **Portal finders** (finders externos) → `https://portal.fontiber.com` (MVP 1.5, 2026-04-24)
- Auth: NextAuth con dos CredentialsProviders (admin-credentials y finder-credentials)
- Repo: https://github.com/albertofontiber/war-room (privado, CI/CD automático)
- Tests: vitest, 71 unit tests sobre libs (crm, format, validation)

---

## 2. Estructura de archivos clave

```
src/
  app/
    page.tsx                              # Dashboard principal war room (requiere auth kind=admin)
    daily/[fecha]/page.tsx                # Resumen diario público (sin auth)
    pipeline/page.tsx                     # Pipeline Kanban CRM (admin)
    finders/page.tsx                      # Admin: lista de finders + set/reset password ⭐ (PR #11)
    finders/proposals/page.tsx            # Admin: revisar TargetProposal de los finders ⭐ (PR #14)
    portal/                               # Subdominio portal.fontiber.com ⭐ (MVP 1.5)
      layout.tsx                          # Layout mínimo (no comparte Navbar con war room)
      login/page.tsx                      # Finder login (email + password bcrypt)
      page.tsx                            # Kanban read-only del finder (solo sus targets)
      empresas/[id]/page.tsx              # Ficha de target asignado al finder
      proponer/page.tsx                   # Form "Proponer target" + historial propuestas
    api/
      empresas/route.ts                   # GET — GeoJSON de todas las empresas (excluye anónimas)
      empresas/[id]/route.ts              # GET — detalle de empresa
      empresas/[id]/perimetro/            # PATCH — toggle enPerimetro
      empresas/[id]/grupo/                # PATCH — asigna/crea grupo
      empresas/[id]/notas/route.ts        # GET/POST — notas (incluye autorFinder)
      empresas/[id]/tareas/route.ts       # GET/POST — tareas (incluye autorFinder/asignadoFinder)
      empresas/[id]/historial/route.ts    # GET — timeline (incluye autorKind admin/finder)
      empresas/search/route.ts            # GET — autocomplete admin (para vincular leads)
      empresas/[id]/stage/route.ts        # PATCH — cambiar dealStage
      empresas/[id]/finder/route.ts       # PATCH — asignar finder
      grupos/route.ts                     # GET — lista todos los grupos (autocomplete)
      chat/route.ts                       # POST — Chat IA streaming (Claude + SQL tools)
      leads/route.ts                      # POST — crear lead anónimo
      leads/[id]/link/route.ts            # POST — vincular lead anónimo a empresa real ⭐ (PR #10)
      finders/route.ts                    # GET — lista finders (incluye passwordSetAt)
      finders/[id]/password/route.ts      # POST — set/reset bcrypt password ⭐ (PR #11)
      admin/proposals/route.ts            # GET — TargetProposal con dedupMatch on-the-fly ⭐ (PR #14)
      admin/proposals/[id]/route.ts       # PATCH — resolver propuesta (accept/dup/OOS/reject)
      portal/                             # Endpoints del portal finders ⭐ (MVP 1.5)
        pipeline/route.ts                 # GET — Kanban filtrado por finderSourceId
        empresas/[id]/route.ts            # GET — ficha filtrada (404 si no es del finder)
        empresas/search/route.ts          # GET — autocomplete de empresas (solo nombre+CIF)
        empresas/[id]/notas/route.ts      # POST — crear nota
        empresas/[id]/tareas/route.ts     # POST — crear tarea
        empresas/[id]/actividades/route.ts # POST — crear actividad
        notas/[id]/route.ts               # PATCH/DELETE — propia + ventana 24h
        tareas/[id]/route.ts              # PATCH/DELETE — autor <24h, toggle completada siempre
        actividades/[id]/route.ts         # PATCH/DELETE — propia + ventana 24h
        proposals/route.ts                # GET (propio historial), POST (crear + dedup silencioso)
      borme/
        operaciones/route.ts              # GET — señales M&A enriquecidas
        personas-compartidas/route.ts     # GET — personas en 2+ empresas activas
        recientes/route.ts                # GET — todos los actos BORME últimos 90 días
      cron/
        borme/route.ts                    # GET — cron BORME (L-V 20:00 UTC = 22:00 CEST)
        daily-summary/route.ts            # GET — cron email resumen (Ma-Sa 06:00 UTC)
        task-digest/route.ts              # GET — cron tareas por usuario (L-V 07:00 UTC)
  components/
    ChatIA.tsx                            # Chat IA flotante — Claude + SQL sobre datos War Room + CRM
    WarRoomLayout.tsx                     # Layout raíz admin — renderiza Mapa/Tabla/Operaciones/Grupos + ChatIA
    PipelinePageClient.tsx                # Kanban CRM admin + filtros + ChatIA + "+ Lead sin identificar"
    AddLeadModal.tsx                      # Modal para crear leads anónimos
    LinkLeadModal.tsx                     # Modal "vincular lead a empresa real" ⭐ (PR #10)
    MapaEspana.tsx                        # Mapa Mapbox (1130 líneas — candidato a refactor)
    Navbar.tsx                            # Barra superior + icono "admin" link a /finders
    Sidebar.tsx                           # Filtros + estadísticas (9 stages CRM + filtro Grupo)
    TablaEmpresas.tsx                     # Tabla con sorting, columna CIF y export Excel
    PanelEmpresa.tsx                      # Panel lateral detalle empresa (+ botón Vincular si esAnonima)
    CrmSections.tsx                       # Notas/Tareas/Historial + FinderBadge ⭐ (ampliado PR #13)
    OperacionesBorme.tsx                  # Vista Operaciones M&A
    GruposView.tsx                        # Vista Grupos
    FindersAdminClient.tsx                # Vista admin /finders con modal set-password ⭐ (PR #11)
    ProposalsAdminClient.tsx              # Vista admin /finders/proposals ⭐ (PR #14)
    portal/                               # Componentes cliente del portal ⭐ (MVP 1.5)
      PortalPipelineClient.tsx            # Kanban 6 estados agregados
      PortalTargetClient.tsx              # Ficha + secciones (tareas/actividades/notas)
      PortalProposeClient.tsx             # Form de proponer + autocomplete neutro
  lib/
    auth.ts                               # NextAuth: admin-credentials + finder-credentials ⭐ (PR #11)
    borme.ts                              # Lógica BORME: fetch, parse, classify, process ⭐
    borme-senales.ts                      # Catálogo señales por grupo
    chat-schema.ts                        # Schema BD + system prompt para Chat IA
    crm.ts                                # DEAL_STAGES + labels/pills + FINDER_STATUS_MAP ⭐
    normalize.ts                          # Fuente de verdad normalización nombres (empresas/personas)
    filtros.ts                            # isInFilter() tipificado con EmpresaFeatureProperties
    format.ts                             # fmt, fmtM, fmtPct, fmtDate, fmtMillions
    email-daily-summary.ts                # Email diario (Resend)
    email-task-digest.ts                  # Email task digest por usuario (Resend)
    validation.ts                         # Schemas zod: war room + portal + proposals
    finder-session.ts                     # requireCurrentFinder + canEditWithin24h ⭐ (PR #12)
    finder-access-log.ts                  # logFinderAction fire-and-forget ⭐ (PR #14)
    user-from-session.ts                  # requireCurrentUser / getCurrentUser (admin)
    *.test.ts                             # Suite vitest (lib/crm, lib/format, lib/validation — 71 tests)
    prisma.ts                             # Singleton PrismaClient
  store/
    useWarRoomStore.ts                    # Zustand store + EmpresaFeatureProperties tipificado
  types/index.ts                          # Tipos + FILTROS_DEFAULT + DealStage (9 valores con on_hold)
  middleware.ts                           # Routing host/path — portal vs war room ⭐ (MVP 1.5)

prisma/schema.prisma                      # Modelos BD (schema único para war room + portal)

scripts/
  # ─── Recurrentes (diarios / periódicos) ──────────────────────────────
  run-borme-today.ts                      # Ejecutar BORME manualmente: npx dotenv-cli -e .env.local -- npx tsx scripts/run-borme-today.ts YYYYMMDD
  borme-test.ts                           # Test BORME read-only
  borme-backfill.ts                       # Template backfill (no ejecutar sin motivo)
  scrape-empresia.ts                      # Scraping empresia.es → PersonaCargo (trimestral, julio 2026)
  validate-empresia.ts                    # Validación 4D del scraping
  test-email.ts                           # Envía email de prueba
  # ─── Diagnóstico (read-only) ──────────────────────────────────────────
  find-empresa.ts                         # Buscar empresa en DB por nombre
  borme-buscar-empresa.ts                 # Buscar empresa en historial BORME
  check-borme-today.ts                    # Ver alertas BORME creadas hoy
  check-crm-changes.ts                    # Ver cambios CRM del día
  check-cp-mismatches.ts                  # Detecta inconsistencias CP vs provincia
  check-fire-personas.ts                  # Check personas Grupo Fire
  check-fuente.ts / check-grupos.ts       # Checks de integridad
  inspect-excel.ts / inspect-borme-descriptions.ts / borme-inspect.ts / borme-test-api.ts
  archive/                                # One-off ya ejecutados + outputs intermedios ⭐ (PR #17)
                                          # 33 scripts + README.md + 11 JSON de webs

vercel.json                               # Crons: BORME 20:00 L-V · Resumen 06:00 Ma-Sa · Task digest 07:00 L-V (UTC)
.env.example                              # Plantilla env vars ⭐ (PR #17)
```

---

## 3. Funcionalidades completadas ✅

- Mapa Mapbox con ~5.140 empresas, clusters, marcadores por sector/prioridad
- Jitter deterministico en coordenadas: offset ±44m por hash del CIF (evita solapamiento exacto)
- Panel lateral de empresa: financieros, gráfico histórico, CRM, actividades, alertas BORME, scroll nativo
- Filtros completos: CCAA + Provincia (cascada), Sector, Perímetro, Cepreven, Aerme, Grupo, Stage CRM, sliders duales (Ingresos, Margen Bruto %, EBITDA %)
- Selección de área por polígono: doble-clic → dibuja polígono → tabla de empresas en área, sortable
- Vista tabla con sorting, toggle "Vista del mapa", columna CIF y export a Excel
- Mapa resize automático al abrir/cerrar panel lateral
- Persistencia de viewport del mapa al cambiar entre vistas
- **BORME**: backfill 6 meses completado (1.223 alertas), cron diario configurado
- **BORME**: backfill 2 años completado (02/04/2026) ✅
- **BORME**: cross-referencing M&A completado (ver sección 4)
- **Dashboard Operaciones M&A** completado con 3 sub-tabs (ver sección 5)
- **Pipedrive sync** ✅ (DEPRECADO 2026-05-02 — cut-over completo, ver §7)
- **CRM ampliado a 8 etapas**: identificado / contactado / 1ª reunión / análisis / LOI enviada / ejecución / portfolio / muerto ✅
- **Deploy en producción**: https://warroom.fontiber.com ✅
- **Grupos actualizados**: Grupo Fire (23), Plana Fabrega (12), Eurofesa (5), Scutum, Attlon ✅
- **Perímetro actualizado**: 1.552 in / 2.805 out (desde Excel 29/03/2026) ✅
- **Toggle perímetro** en PanelEmpresa persiste en BD vía `PATCH /api/empresas/[id]/perimetro` ✅
- **Seguridad electrónica importada**: 666 nuevas + 399 mixtas + 5 adicionales sesión 7, total 5.022 empresas ✅
- **Financieros seg. electrónica**: 579+ empresas macheadas, 1.331+ registros financieros, 422 CPs geocodificados ✅
- **normalize.ts**: librería compartida de normalización de nombres (sesión 8) ✅ — `normalizePersona()`, `normText()`, `bormePersonaToCargoKey()`
- **PersonaCargo (esJuridica)**: campo `esJuridica Boolean` añadido al schema; scraping captura empresas jurídicas administradoras además de personas físicas (sesión 8) ✅
- **Scraping empresia.es Run 3**: 7.816 PersonaCargo en ~2.429 empresas (del universo de ~5.140) ✅
- **Personas-compartidas Fase 2**: tab "Alertas personas" consulta PersonaCargo directamente (vs parseo BormeAlerta); badge fuente (empresia/borme); displayName en orden natural ✅
- **Task H: BORME cron → PersonaCargo**: tras cada nueva BormeAlerta de tipo nombramiento/otros, upsert automático en PersonaCargo ✅
- **Corrección aliases de provincia**: 271 empresas corregidas (Illes Balears→Baleares ×195, Lleida→Lérida ×53, Ourense→Orense ×23, Elecnor SA Sevilla→Madrid) ✅
- **Backfill PersonaCargo desde BORME**: 366 registros nuevos para empresas sin datos empresia → total 8.182 PersonaCargo, 2.583 empresas con cargo vigente ✅
- **Registro Ertzaintza (País Vasco)**: 7 PCI→mixto + 4 nuevas empresas insertadas (enPerimetro: true, fuente: ertzaintza_registry) ✅
- **Registro Mossos (Cataluña)**: 36 PCI→mixto + 102 nuevas empresas insertadas + M. Boada SA enPerimetro:true (fuente: mossos_registry) ✅ — 84 enriquecidas con web/linkedin/telefono
- **Chat IA flotante** (sesión 9): Claude genera queries SQL SELECT contra la BD en lenguaje natural. Streaming con Vercel AI SDK v6. Markdown con react-markdown + @tailwindcss/typography. Pregunta por horizonte temporal en queries temporales. **Montado también en `/pipeline`** con contexto CRM completo (tablas User, Nota, Tarea, Finder, FinderNote, TargetProposal, CrmEstado/CrmLog/Actividad ampliados con `autorId` y `fechaEntradaStage`). ✅
- **Re-geocoding mejorado** (sesión 9): 1.016 empresas re-geocodificadas con Nominatim (233 a nivel calle, 647 a nivel CP, 136 a nivel localidad). Script: `geocode-remaining.ts` ✅
- **Limpieza provincia/ccaa** (sesión 9): 300+ empresas corregidas — Illes Balears→Baleares (194), provincia=Cataluña→correcta (61), null ccaa rellenados (37), Madrid-area corregidos manualmente (20), mossos_registry→Barcelona (18) ✅
- **Documentación Notion**: 4 páginas creadas en el War Room (Funcionalidades, Esquema técnico, Next Steps DB, Decisiones de diseño) ✅
- **Grupos editables desde panel**: sección GESTIÓN (ámbar) con autocomplete + "Crear nuevo" ✅
- **Clusters como donut pie chart**: proporciones de etapas CRM visibles en cada cluster ✅
- **Filtro de Grupo en Sidebar**: pills para cada grupo, chips activos en la barra de filtros ✅
- **Vista Grupos**: nueva pestaña en Navbar con tabla de grupos y sus empresas ✅
- **Exportar tabla a Excel**: botón en toolbar de la vista Tabla ✅
- **Email resumen diario**: cron Ma-Sa 06:00 UTC → email con 5 cifras (totales + desglose M&A diferenciado) + link a /daily/[fecha] ✅
- **Email task-digest por usuario**: cron L-V 07:00 UTC → tareas vencidas, hoy y próximos 7 días (1 email por usuario activo con tareas asignadas) ✅
- **Badge de tareas pendientes**: visible en Kanban (ya existía), tooltip del mapa y filas de la tabla (`XT` en ámbar) ✅
- **Página /daily/[fecha]**: pública (sin login), resumen completo con diseño War Room ✅
- **force-dynamic en todas las rutas API**: garantiza datos frescos, sin caché de Vercel ✅
- **Leads anónimos** (PR #8-#10, abril 2026): crear y vincular targets confidenciales sin identidad revelada. `Empresa.esAnonima=true`, CIF placeholder `LEAD-{id}`, aparecen solo en `/pipeline`. Endpoint `POST /api/leads/:id/link` mueve notas/tareas/actividades/CrmLog/Financieros del lead a una empresa real y borra el lead. CrmEstado del lead prevalece sobre el del target. Hasta hoy los leads anónimos vienen de Deale (otro finder fuera del portal). ✅
- **Portal de finders MVP 1.5** (PRs #11-#14, 2026-04-24): subdominio `portal.fontiber.com`, auth bcrypt gestionada por admins desde `/finders`, Kanban read-only con 6 estados agregados, crear/editar notas/tareas/actividades con ventana 24h, proponer targets nuevos con dedup silencioso, `FinderAccessLog` auditoría. Ver sección 17 para detalles. ✅
- **Cleanup deuda técnica** (PR #17): `.env.example` en raíz, 33 scripts one-off archivados en `scripts/archive/`, tipificación completa de `RawFeature.properties` en el store Zustand. ✅
- **Hardening set-password + instructions.md** (PR #18): endpoint `/api/finders/:id/password` valida la persistencia tras `update`, devuelve `passwordSetAt`. Cliente `FindersAdminClient` falla loud si el server no confirma la escritura. ✅
- **Unificación labels GM** (PR #19): todos los textos visibles dicen "GM" / "GM%" en lugar de "MB" / "Margen bruto". Identificadores internos (`margenBruto*`) intactos. ✅
- **Filtros sidebar + columnas Excel** (PR #20): pill "Sin grupo" (sentinel `0` en `filtros.grupoId`), pill `on_hold` añadido al filtro CRM, columnas Grupo y Web en el export de Pipeline y Tabla. ✅
- **StageChevron en modo compacto** (PR #21): el `PanelEmpresa` desde mapa/tabla muestra el bloque Funnel con chevron interactivo (igual que `/pipeline`), permitiendo cambiar el stage sin navegar. ✅
- **Notificaciones in-app + email cuando un finder propone target** (PR #25, 2026-04-28): nuevo modelo `Notificacion` (genérico para futuros eventos), endpoint `GET/PATCH /api/notificaciones`, helper `notifyAdmins()` (in-app + email Resend con override `NOTIFICATION_EMAIL_TO`), campana en topbar del Navbar con badge de no-leídas y polling 30s. Hook fire-and-forget en `POST /api/portal/proposals` dispara `tipo: "proposal_new"` para todos los admins activos. ✅
- **Crear finder desde la web + password estática** (PR #26 + hotfix #27, 2026-04-28): botón "+ Nuevo finder" en `/finders` con modal (nombre, email, comisión, password inicial generable o manual). El modal de "Gestionar password" ya **NO auto-genera** al abrir — muestra "Fijada el {fecha}" y un botón explícito "Cambiar password" para entrar en modo edición. Endpoint `POST /api/finders` crea con bcrypt + `passwordSetAt` en una transacción. ✅
- **Editar finder + header /finders en una línea** (PR #29, 2026-04-29): botón "Editar" por finder con modal (nombre, email único, comisión, toggle activo/inactivo). Endpoint `PATCH /api/finders/:id` con `FinderUpdateSchema`. `GET /api/finders` acepta `?includeInactive=1` (la página `/finders` lo pasa; el resto de consumidores siguen recibiendo solo activos). ✅
- **Fix fechaLimite Invalid input** (PR #28, 2026-04-29): `nullableDateString` en `validation.ts` ahora acepta también `yyyy-mm-dd` (formato nativo del `<input type="date">`). Antes solo aceptaba ISO 8601 con offset, lo que rompía la creación de tareas desde el panel de empresa. ✅
- **Separar "Sin CRM" de "Identificado"** (PR #30, 2026-04-29): nuevas constantes en `lib/crm.ts` (`SIN_CRM_SENTINEL = "sin_crm"`, `SIN_CRM_LABEL`, `SIN_CRM_COLOR = "#6b7280"`), `FiltrosActivos.crmStage` admite `(DealStage | "sin_crm")[]`. Sidebar añade pill "Sin CRM" antes de "Identificado". Mapa: rama explícita para `identificado` (slate `#94a3b8`); default cambia a gris-500 (`#6b7280`) para empresas sin `dealStage`. Leyenda separa las dos entradas. `StageChevron` añade "Sin CRM" como primera opción del dropdown. ✅
- **Fix mapa cluster markers stale** (PR #31, 2026-04-29): los pie-chart markers de cluster solo se actualizaban en `onMoveEnd`/`onIdle` de Mapbox. Al cambiar filtros sin mover el mapa, el state `clusterMarkers` se quedaba con datos viejos (síntoma: filtros nuevos → 0 pines en el mapa pese a 58 empresas en el sidebar). Fix: `useEffect` que dispara `updateClusterMarkers` cuando cambia `geojson`, con doble `setTimeout` (50ms + 250ms) para dejar que Mapbox digiera el data update. ✅
- **Unificar buscador del Navbar** (PR #32, 2026-04-29): el buscador del topbar ahora funciona en cualquier página (antes el dropdown salía vacío fuera del mapa porque `empresasGeoJSON` solo se cargaba al montar `MapaEspana`). El `Navbar` dispara el fetch de `/api/empresas` lazy si el store está vacío. Eliminada la barra "Nombre o CIF" duplicada de `/pipeline` — el filtro local del kanban se mantiene como input dentro de `PipelineFiltros` entre los demás filtros (CCAA, Provincia, Sector, …). ✅

---

## 4. Integración BORME ✅ COMPLETADA

### Estado

- Backfill 6 meses ejecutado el 29/03/2026: **1.223 alertas**
- Backfill 2 años ejecutado el 02/04/2026: datos desde 01/04/2024
- **854 alertas reclasificadas** nombramiento→otros (script `reclasificar-ceses.ts`, 02/04/2026): eran nombramientos pero el texto contenía solo ceses/revocaciones
- Cron diario activo en `vercel.json`: L-V 20:00 UTC (22:00 CEST) → `/api/cron/borme`
- Re-clasificación M&A ejecutada el 30/03/2026: **93 señales operacionales** detectadas
- **El cron procesa el BORME del DÍA EN CURSO** (no el del día anterior). A las 22:00 el BORME del día ya está completo.

### Clasificación de actos (`tipoActo`)

```
fusion              — Fusión / absorción / escisión
adquisicion         — Socio único / unipersonalidad / cesión de participaciones
posible_adquisicion — nombramiento_grupo en empresa que NO pertenece aún al grupo
                      (persona clave de un grupo conocido detectada fuera de ese grupo)
cambio_denominacion — Cambio de denominación (rebranding post-adquisición)
nombramiento_grupo  — Nombramiento con persona conocida de un grupo; empresa YA pertenece a ese grupo
nombramiento        — Nombramiento sin señal de grupo conocido
otros               — Resto: ceses, revocaciones, dimisiones, disoluciones, capital, etc.
```

> **Importante**: `otros` agrupa muchos tipos distintos, incluyendo ceses/revocaciones. La clasificación correcta entre nombramiento y cese depende del texto: si el texto contiene CESE/REVOCACION sin NOMBRAMIENTO, el acto se clasifica como `otros`, no `nombramiento`.

### Lógica de clasificación (`src/lib/borme.ts` → `clasificarActo`)

```typescript
// 1. Fusión / adquisición / denominación — prioridad máxima
// 2. Si hasPositive (NOMBRAMIENTO) OR (hasCargo AND NOT hasNegative) → nombramiento/nombramiento_grupo
//    luego si es nombramiento_grupo y empresa NO pertenece al grupo → posible_adquisicion
// 3. Si hasNegative (CESE/REVOCACION/DIMISION) OR hasCargo sin nombramiento → otros
```

### Catálogo de señales por grupo (`src/lib/borme-senales.ts`)

Personas clave y keywords para cada grupo. `detectarGrupo(texto)` devuelve el grupo y motivo.

| Grupo | Personas clave |
|---|---|
| Grupo Fire | LUCIANO VILLEN MARTA, ZALA NAVARRO ALEJANDRO, REYES ROMERO LUIS ROBERTO, GUITARD MALDONADO ALVARO, DE LA PASCUA ARAGON PABLO |
| Eurofesa | BJURSTROM TOR FILIP, FRANSSON BENGT OLOF JOHAN, FRANSSON OLOF, LOPEZ LOPEZ DAVID |
| Scutum | THIERRY PASCAL HENRI BABULE, BABULE THIERRY PASCAL HENRI, TURCHI PASCAL LUCIEN ELIO ARTHUR, PASCAL TURCHI |
| Attlon | BECKER LARS, URBON GARCIA FUENTES INIGO |
| Plana Fàbrega | (sin personas, solo keywords denominación/socio único) |

**Para añadir un nuevo grupo o persona**: editar `GRUPOS_SENALES` en `borme-senales.ts` y ejecutar el backfill de re-clasificación.

### Backfill de re-clasificación

```bash
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' scripts/borme-backfill-grupos.ts
```

Resultados del backfill (30/03/2026):
- Señales totales: 93 (19 fusión, 47 adquisición, 13 rebranding, 14 nombramiento_grupo)
- 41 adquisiciones sin grupoInferido (compradores externos: Serveo, Cajamarca, Dragados, Ilunion…)
- Grupos asignados a nuevas empresas: Attlon (3), Scutum (4), Eurofesa (1)

---

## 5. Dashboard Operaciones M&A ✅ COMPLETADO

Vista accesible desde el botón **"Operaciones"** en la Navbar.

### Sub-tab "Señales M&A"

- **API**: `GET /api/borme/operaciones`
  - `TIPOS_OPERACIONALES = ["fusion", "adquisicion", "cambio_denominacion", "nombramiento_grupo", "nombramiento"]`
  - Enriquecidas con: financieros del año más reciente, grupoInferido, adquirente extraído del texto
  - Calcula `efectiveTipo`:
    - `nombramiento_grupo` + empresa NO en el grupo → `posible_adquisicion`
    - `nombramiento_grupo` + empresa YA en el grupo → se muestra como `nombramiento` (actividad interna del grupo)
    - resto de tipos → igual que `tipoActo`
  - Deduplicación por (empresaId, día): conserva el tipo de mayor prioridad
- **Botón refresh** (↻) para forzar re-fetch sin recargar página
- **Tabla compacta** sortable por fecha / ingresos / EBITDA%
  - Columnas: Fecha | Tipo | Empresa (⊕ perímetro, link web) | Adquirente | Ingresos | EBITDA | MB% | BORME↗
  - Click en fila → expande descripción inline
  - Filas `posible_adquisicion` con fondo naranja tenue
- **Filtros de tipo**: Fusión / Adquisición / Posible adq. / Nombramiento / Rebranding (pills)
- **Filtro de fecha**: desde / hasta
- **Filtros del sidebar** (enPerimetro, CCAA, provincia, sector, grupoId, ingresos) → aplicados client-side

### Sub-tab "Alertas personas"

- **API**: `GET /api/borme/personas-compartidas` — **Fase 2: consulta PersonaCargo directamente**
  - Lee `PersonaCargo WHERE vigente=true`, agrupa por `nombreNorm`
  - Solo aparecen personas con registros activos en ≥2 empresas distintas
  - Excluye personas ya en GRUPOS_SENALES (convertidas a formato PersonaCargo con `bormePersonaToCargoKey`)
  - Para registros de `fuente='borme'`: lookup secundario en BormeAlerta por (empresaId, fechaDesde) para recuperar `urlBorme`
  - `displayName`: nombre en orden natural (preferido: nombreOrig de fuente=empresia; fallback: borme)
- **Tabla colapsable** por persona:
  - Fila colapsada: Persona (displayName) | Empresas (count) | En perímetro | Ingresos totales | Última incorporación
  - Fila expandida (por empresa): Empresa (clickable + grupo pill + web icon) | Badge fuente (empresia/borme) | Rol | Ingresos | EBITDA·GM% | Fecha·BORME↗
  - Headers sortables: nombre / ingresos / enPerimetro (con indicadores ↑↓↕)
- **Filtros del sidebar** → se muestra una persona si AL MENOS UNA de sus empresas activas pasa el filtro

### Sub-tab "Actividad reciente"

- **API**: `GET /api/borme/recientes`
  - Devuelve todos los `BormeAlerta` de los últimos 90 días (todos los tipos)
  - Enriquecidos con empresa (nombre, CIF, financieros, grupo, perímetro)
- **Tabla**: Fecha | Tipo (pill coloreado) | Empresa | Provincia | Grupo | Ingresos | BORME↗
- **Stats bar**: contadores por `tipoActo`
- Lazy fetch: solo se carga cuando el usuario entra en este sub-tab

---

## 6. Vista Grupos ✅ NUEVO (sesión 6)

- Accesible desde el botón **"Grupos"** en la Navbar
- Componente: `src/components/GruposView.tsx`
- Muestra tabla de grupos con sus empresas, financieros agregados y perímetro
- Click en empresa → abre PanelEmpresa (via evento `selectEmpresa`)
- `WarRoomLayout.tsx` escucha el evento `selectEmpresa` para mostrar el panel también desde esta vista

---

## 7. Integración Pipedrive — DEPRECADA (cut-over 2026-05-02)

El War Room es la fuente de verdad del CRM desde abril 2026. Pipedrive
quedó en pausa el 2026-05-01 (PR #47, cron desactivado en `vercel.json`)
y se hizo el cut-over completo el 2026-05-02 en dos fases:

**Fase A** (PR #59):
- Endpoint `/api/cron/pipedrive` y scripts `pipedrive-sync.ts`,
  `run-pipedrive.ts`, `inspect-pipedrive-samples.ts`,
  `check-pipedrive-unmatched.ts`, `detect-cron-reversions.ts` y
  `restore-cron-reverted-empresas.ts` eliminados.
- Link "Ver en Pipedrive (legacy)" del PanelEmpresa retirado.
- Variables `PIPEDRIVE_API_KEY` y `pipedriveOrgId` ya no se usan en
  código.

**Fase B** (PR #60):
- Backfill 173 filas `CrmEstado.ownerUserId` (90 a Alberto, 83 a Gabriel)
  desde el string legacy `owner` (`scripts/archive/migrate-crm-owner-to-userid.ts`).
- DROP COLUMN `CrmEstado.pipedriveOrgId`, `CrmEstado.owner` y
  `CrmLog.owner` en Supabase prod vía `prisma db push`.
- 202/202 CrmEstado tienen ahora `ownerUserId`.
- Pendiente manual fuera del repo: export histórico de Pipedrive a
  OneDrive y baja de la suscripción.

Los scripts archivados en `scripts/archive/` (`migrate-pipedrive-activities.ts`,
`backfill-fecha-entrada-stage.ts`, `fix-fecha-entrada-stage.ts`) se
conservan como rastro histórico de la migración inicial — no se
ejecutan ya.

---

## 8. Mapa — detalles técnicos

### Fuentes y capas

El mapa usa **dos fuentes GeoJSON** calculadas client-side en `MapaEspana.tsx`:

| Fuente | Contenido | Cluster | Capas | Z-order |
|---|---|---|---|---|
| `empresas-bg` | Empresas que **NO pasan** los filtros | No | `markers-bg` (gris #2d2d2d, opacity 0.7) | **Abajo** (declarada primero) |
| `empresas` | Empresas que **pasan** los filtros activos | Sí (maxZoom 10) | `clusters`, `borme-ring`, `markers-pci`, `markers-segelec`, `markers-mixto` | **Encima** (declarada después) |

> **Z-order Mapbox GL**: las capas declaradas antes en el JSX quedan por debajo. `empresas-bg` se declara ANTES de `empresas` para que las empresas filtradas (activas) queden visualmente por encima de las excluidas. Si se invirtiera el orden, al aplicar un filtro las ~5000 empresas grises taparían las pocas empresas relevantes.

La propiedad `enFiltro` está presente en los features pero las fuentes separadas hacen de filtro de visibilidad sin necesitar usarla en los layers de pintado.

### Anillo BORME (`borme-ring`)

- **Color**: ámbar (#f59e0b), animado (escala 1→2.5, opacidad 0.7→0)
- **Criterio** (`hasBormeReciente`): la empresa tiene al menos una alerta de tipo `fusion`, `adquisicion` o `posible_adquisicion` en los **últimos 7 días**
- **Filter**: `hasBormeReciente=true` AND `enFiltro=true` (si la empresa no tiene pin visible, no aparece el anillo)
- Calculado en `/api/empresas/route.ts` con `PULSE_TIPOS = new Set(["fusion", "adquisicion", "posible_adquisicion"])`

### Marcadores por sector

| Sector | Forma | Capa |
|---|---|---|
| PCI | Círculo | `markers-pci` (circle layer) |
| Seguridad electrónica | Cuadrado redondeado | `markers-segelec` (symbol, icono SDF) |
| Mixto | Hexágono | `markers-mixto` (symbol, icono SDF) |

Los iconos SDF (`shape-square`, `shape-hexagon`) se añaden al estilo en `handleMapLoad`. Color = `CRM_COLOR` (expresión Mapbox por `dealStage`).

**`circle-sort-key` / `symbol-sort-key`**: empresas `enPerimetro=true` tienen sort-key=1 (se renderizan encima de las que no están en perímetro, sort-key=0).

### Clusters como donut pie chart

Los clusters ya no son círculos de color sólido. Se usan `Marker` de react-map-gl con un SVG personalizado (`ClusterPie`) que muestra la distribución proporcional de etapas CRM.

- `clusterProperties` agrega contadores por stage: `s_id`, `s_ct`, `s_pr`, `s_an`, `s_lo`, `s_ex`, `s_po`, `s_mu`
- La capa `clusters` es transparente (solo para detección de clicks)
- `updateClusterMarkers` consulta `querySourceFeatures("empresas")` en cada `onIdle` y actualiza los `Marker` React

### Fix reuseMaps + iconsReady

Con `reuseMaps` activo, el evento `onLoad` **no se dispara** al remontar el componente. Fix: `handleIdle` comprueba con `map.hasImage()` si los iconos siguen en el estilo, los re-añade si faltan, y llama `setIconsReady(true)`.

### Colores CRM (8 etapas)

```typescript
const CRM_COLOR = [
  "case",
  ["==", ["get", "dealStage"], "contactado"],      "#38bdf8",  // sky
  ["==", ["get", "dealStage"], "primera_reunion"], "#3b82f6",  // blue
  ["==", ["get", "dealStage"], "analisis"],        "#8b5cf6",  // violet
  ["==", ["get", "dealStage"], "LOI enviada"],     "#f59e0b",  // amber
  ["==", ["get", "dealStage"], "execution"],       "#f97316",  // orange
  ["==", ["get", "dealStage"], "portfolio"],       "#22c55e",  // green
  ["==", ["get", "dealStage"], "muerto"],          "#ef4444",  // red
  "#94a3b8",  // slate — sin CRM / identificado
]
```

---

## 9. CRM — Etapas (8 stages)

| `dealStage` | Label UI | Color |
|---|---|---|
| `identificado` | Sin CRM / Identificado | Slate |
| `contactado` | Contactado | Sky |
| `primera_reunion` | 1ª reunión | Blue |
| `analisis` | Análisis | Violet |
| `LOI enviada` | LOI enviada | Amber |
| `execution` | Ejecución | Orange |
| `portfolio` | Portfolio | Green |
| `muerto` | Muerto | Red |

---

## 10. Email resumen diario + Página /daily/[fecha] ✅

### Flujo completo

```
22:00 CEST (L-V)  →  BORME del día  →  Supabase
08:00 CEST (Ma-Sa) →  Email con 3 cifras + link  →  /daily/YYYY-MM-DD (página pública)
```

### Email (`src/lib/email-daily-summary.ts`)

- **Cron**: Ma-Sa 06:00 UTC (08:00 CEST) → `GET /api/cron/daily-summary`
- **Librería**: Resend — init **dentro** de la función (no a nivel módulo)
- **Destinatario**: `SUMMARY_EMAIL_TO` (default: alberto@fontiber.com)
- **Contenido**: 5 cifras en dos filas — fila 1: señales BORME + alertas personas. Fila 2 (desglose M&A): Fusión / Adquisición / Posible adq. (cada categoría coloreada y diferenciada, ya no agregada). Botón "Ver resumen completo →"
- **Enlace**: `warroom.fontiber.com/daily/YYYY-MM-DD` (fecha = día anterior = día de los datos). Botón "← Ir al War Room" en la página → `/operaciones`
- **Lógica `posible_adquisicion`**: misma regla que `/api/borme/operaciones` — `tipoActo=nombramiento_grupo` + `grupoInferido != null` + empresa NO mapeada al grupo (`empresa.grupoId !== grupoInferido.id`). Si la empresa ya está en el grupo se cuenta como Nombramiento.

```typescript
// Test manual con datos de 7 días
npx dotenv-cli -e .env.local -- npx tsx scripts/test-email.ts
```

### Página `/daily/[fecha]`

- **Acceso**: público, sin login
- **Formato fecha**: YYYY-MM-DD (e.g. `/daily/2026-04-02`)
- **Secciones**: stats → Señales M&A → Todas las señales → Alertas personas

### Email task-digest por usuario (`src/lib/email-task-digest.ts`)

- **Cron**: L-V 07:00 UTC (~8 Madrid invierno / 9 verano) → `GET /api/cron/task-digest`
- **Destinatarios**: un email por cada `User.active=true` que tenga `Tarea.asignadoId` con `completada=false`
  - Usuario sin tareas pendientes no recibe email (no spam)
- **Contenido**: 4 bloques según `fechaLimite` comparado con "hoy 00:00":
  - Vencidas (<hoy) — rojo
  - Hoy — ámbar
  - Próximos 7 días (> mañana 00:00 y < hoy+8 00:00) — azul
  - Sin fecha — gris
- **Query params para testing**:
  - `?to=a@x.com,b@x.com` fuerza destinatarios (redirige todos los digests)
  - `?force=true` envía también cuando el usuario no tiene tareas (para validar plantilla)

---

## 11. Modelos de datos relevantes (Prisma)

### BormeAlerta

```prisma
model BormeAlerta {
  id               Int            @id @default(autoincrement())
  empresaId        Int
  empresa          Empresa        @relation(fields: [empresaId], references: [id])
  fecha            DateTime
  tipoActo         String         // "fusion"|"adquisicion"|"posible_adquisicion"|"cambio_denominacion"|"nombramiento_grupo"|"nombramiento"|"otros"
  descripcion      String?
  urlBorme         String?
  leido            Boolean        @default(false)
  grupoInferidoId  Int?
  grupoInferido    Grupo?         @relation(fields: [grupoInferidoId], references: [id])
  personaDetectada String?
  createdAt        DateTime       @default(now())
  personas         BormePersona[]
}
```

### PersonaCargo (sesión 8)

```prisma
model PersonaCargo {
  id          Int       @id @default(autoincrement())
  empresaId   Int
  empresa     Empresa   @relation(fields: [empresaId], references: [id])
  nombreNorm  String    // clave canónica: tokens ordenados, sin partículas, sin tildes
  nombreOrig  String    // nombre tal como aparece en empresia
  rol         String?   // administrador_unico | administrador_solidario | consejero_delegado | ...
  fechaDesde  DateTime?
  esJuridica  Boolean   @default(false)  // true = empresa como administradora (holding)
  vigente     Boolean   @default(true)
  fuente      String    // "empresia" | "borme"
  scrapedAt   DateTime  @default(now())
  @@unique([empresaId, nombreNorm])
  @@index([nombreNorm])
  @@index([empresaId])
  @@index([esJuridica])
}
```

**Normalización** (`src/lib/normalize.ts`):
- `normalizePersona(raw, esJuridica=false)` — personas físicas: tokens ordenados sin partículas; jurídicas: elimina sufijo mercantil, no reordena
- `bormePersonaToCargoKey(personaDetectada)` — convierte nombre en formato BORME (orden natural) al formato clave de PersonaCargo

### BormePersona (tabla existente, pendiente de poblar en el cron)

```prisma
model BormePersona {
  id          Int         @id @default(autoincrement())
  alertaId    Int
  alerta      BormeAlerta @relation(fields: [alertaId], references: [id])
  empresaId   Int
  empresa     Empresa     @relation(fields: [empresaId], references: [id])
  nombreNorm  String
  rol         String?
  fecha       DateTime
  createdAt   DateTime    @default(now())
  @@index([nombreNorm])
  @@index([empresaId])
  @@index([alertaId])
}
```

### CrmEstado / CrmLog

```prisma
model CrmEstado {
  id             Int      @id @default(autoincrement())
  empresaId      Int      @unique
  dealStage      String?  // null = "Sin CRM" (fuera del Pipeline)
  ownerUserId    String?
  fechaEntradaStage DateTime?
  updatedAt      DateTime @updatedAt
}

model CrmLog {
  // Registra cambios de stage. Vacío hasta ahora — a partir del 01/04/2026
  // el cron detectará cambios reales y los irá acumulando.
}
```

---

## 12. Roadmap

### Estado sesión 06/04/2026 (sesión 9)

| # | Tarea | Prioridad | Estado | Notas |
|---|---|---|---|---|
| A | Importar seg. electrónica | Alta | ✅ | 666 nuevas + 399 mixtas |
| B | Actualizar grupos desde Excel | Alta | ✅ | 5 grupos |
| C | Actualizar perímetro desde Excel | Alta | ✅ | 1.552 in / 2.805 out |
| D | Editar grupo desde panel lateral | Alta | ✅ | Sección GESTIÓN + autocomplete |
| E | Matchear empresas Pipedrive | Media | ✅ | CIF-first matching; 169 matched |
| F | Cross-referencing BORME (personas) | Alta | ✅ | Catálogo señales + backfill |
| G | Dashboard Operaciones M&A | Alta | ✅ | 3 sub-tabs |
| K | Exportar tabla a Excel | Media | ✅ | |
| L | Vista Grupos | Baja | ✅ | Nueva pestaña en Navbar |
| M | posible_adquisicion en BD | Media | ✅ | nombramiento_grupo → posible_adquisicion si empresa no es del grupo |
| N | CRM 8 etapas | Alta | ✅ | |
| O | Email resumen diario | Alta | ✅ | 3 cifras + link a /daily/[fecha] |
| P | Ampliar backfill BORME a 2 años | Alta | ✅ | Ejecutado 02/04/2026 |
| Q | Financieros seg. electrónica | Alta | ✅ | 579+ empresas, 1.331+ financieros, 422 CPs geocodificados |
| R | Página /daily/[fecha] pública | Alta | ✅ | Sin login, diseño War Room |
| S | 5 empresas faltantes seg. electrónica | Media | ✅ | Añadidas sesión 7 |
| T | normalize.ts — fuente de verdad normalización | Alta | ✅ | sesión 8 — `normalizePersona`, `normText`, `bormePersonaToCargoKey` |
| U | PersonaCargo con esJuridica | Alta | ✅ | sesión 8 — schema + scraping Run 3 (7.816 registros, 2.429 empresas) |
| V | Registro Ertzaintza (País Vasco) | Media | ✅ | sesión 8 — 7 mixto + 4 nuevas |
| W | Registro Mossos (Cataluña) | Media | ✅ | sesión 8 — 36 mixto + 102 nuevas + M.Boada perímetro |
| X | Documentación Notion | Media | ✅ | sesión 8 — 4 páginas: funcionalidades, esquema, next steps, decisiones |
| Y | Corrección aliases de provincia | Media | ✅ | sesión 8 — 271 empresas (Illes Balears, Lleida, Ourense, Elecnor) |
| Z | Backfill PersonaCargo desde BORME | Alta | ✅ | sesión 8 — 366 insertados, total 8.182 PersonaCargo, 2.583 empresas |
| — | 500 en endpoints cron Vercel | Alta | ✅ | Resuelto: devuelven 401 correctamente (sin CRON_SECRET) |
| AA | Chat IA flotante | Alta | ✅ | sesión 9 — Claude + SQL SELECT, streaming, markdown, horizonte temporal |
| AB | Re-geocoding mejorado (Nominatim) | Alta | ✅ | sesión 9 — 1.016 empresas (233 calle, 647 CP, 136 localidad) |
| AC | Limpieza provincia/ccaa | Alta | ✅ | sesión 9 — 300+ empresas corregidas |
| H | Task H: BORME cron → upsert PersonaCargo | Baja | ✅ | sesión 9 — upsert automático en PersonaCargo tras nuevas BormeAlerta |
| — | Fase 2: PersonaCargo → tab personas-compartidas | Alta | ✅ | sesión 8 — Implementado con consulta directa a PersonaCargo |
| I | Web enrichment | Baja | ⏳ | Logos, LinkedIn — bloqueado por SSL scraping |
| — | Registros seg. electrónica otras CCAA | Media | ⏳ | Andalucía, Madrid, Valencia... |

### Estado abril 2026 (tras PRs #2-#32)

| # | Tarea | Prioridad | Estado | Notas |
|---|---|---|---|---|
| AD | MVP 1 CRM (stages 9 + CrmLog + fechaEntradaStage) | Alta | ✅ | PR #1 (ya mergeado sesión anterior) |
| AE | Badges tareas pendientes mapa/tabla/kanban | Media | ✅ | PR #2 |
| AF | Email task-digest por usuario | Alta | ✅ | PR #2 cron L-V 07:00 UTC |
| AG | ChatIA en /pipeline + schema CRM ampliado | Media | ✅ | PR #3 |
| AH | Audit cleanup (stages centralizadas + zod + legacy label) | Alta | ✅ | PR #4 |
| AI | Vitest + 47 unit tests iniciales | Alta | ✅ | PR #5 |
| AJ | Migración histórico Pipedrive activities | Alta | ✅ | PR #6 (210 migradas) |
| AK | Backfill fechaEntradaStage desde Pipedrive | Alta | ✅ | PR #7 (146 filas) |
| AL | Leads anónimos PR A — crear targets confidenciales | Alta | ✅ | PR #8 |
| — | Silent-fail al crear nota/tarea desde panel | Alta | ✅ | PR #9 |
| AM | Leads anónimos PR B — vincular lead a empresa real | Alta | ✅ | PR #10 — POST /api/leads/:id/link |
| AN | MVP 1.5 PR1 — schema Finder + auth base | Alta | ✅ | PR #11 — passwordHash + autorFinderId + visibleAFinder |
| AO | MVP 1.5 PR2 — portal v1 read-only | Alta | ✅ | PR #12 — subdominio portal.fontiber.com, Kanban 6 estados |
| AP | MVP 1.5 PR3 — portal interacciones | Alta | ✅ | PR #13 — crear/editar notas/tareas/actividades + FinderBadge |
| AQ | MVP 1.5 PR4 — propuestas + FinderAccessLog | Alta | ✅ | PR #14 — dedup silencioso al finder, badge "posible duplicado" admin |
| AR | Portal propose autocomplete neutro + DUPLICATE silencioso | Media | ✅ | PRs #15 + #16 |
| AS | Cleanup deuda técnica (scripts/archive/, .env.example, tipos) | Media | ✅ | PR #17 |
| AT | Hardening set-password endpoint + instructions.md al día | Alta | ✅ | PR #18 |
| AU | Unificación labels GM (antes "MB" / "Margen bruto") | Baja | ✅ | PR #19 |
| AV | Filtros sidebar (Sin grupo, on_hold) + Excel grupo/web | Media | ✅ | PR #20 |
| AW | StageChevron en modo compacto del PanelEmpresa | Media | ✅ | PR #21 |
| AX | Notificaciones in-app + email proposal_new + campana en Navbar | Alta | ✅ | PR #25 |
| AY | Crear finder desde web + password estática (no auto-genera al abrir) | Media | ✅ | PRs #26 + #27 (hotfix ESLint) |
| AZ | Editar finder (email, comisión, activo/inactivo) + header 1 línea | Media | ✅ | PR #29 |
| BA | Fix fechaLimite — aceptar yyyy-mm-dd del HTML date input | Alta | ✅ | PR #28 |
| BB | Separar "Sin CRM" de "Identificado" en sidebar/mapa/leyenda/selector | Media | ✅ | PR #30 |
| BC | Fix cluster markers stale al cambiar filtros del mapa | Alta | ✅ | PR #31 |
| BD | Unificar buscador (Navbar funciona en /pipeline + cualquier página) | Media | ✅ | PR #32 |
| — | Cut-over Pipedrive | Alta | ✅ | Cron desactivado #47, código limpio #59, drop columns #60 (2026-05-02) |
| — | Scoring dinámico modular | Media | ⏳ | Sub-scores tamaño/rentabilidad/crecimiento/etc. |
| — | Mapa de conexiones / grafo | Media | ⏳ | Personas compartidas entre empresas (PersonaCargo) |
| — | Fase 2 búsqueda webs | Baja | ⏳ | 882 empresas en perímetro sin web |

### Detalle tareas pendientes

**Registros seg. electrónica otras CCAA**
- Andalucía, Madrid, Valencia, etc. — cada CCAA tiene su propio registro de empresas de seguridad

### Funcionalidades completadas en sesión 9

**Chat IA flotante** (`src/components/ChatIA.tsx` + `src/app/api/chat/route.ts` + `src/lib/chat-schema.ts`)
- Vercel AI SDK v6 (`ai@6.0.146`, `@ai-sdk/react`, `@ai-sdk/anthropic`)
- `useChat` con `DefaultChatTransport` → `POST /api/chat`
- Tool `execute_sql`: Claude genera queries SQL SELECT, backend ejecuta con `prisma.$queryRawUnsafe()`, resultados devueltos a Claude para formatear
- Validación: solo SELECT, sin DROP/DELETE/UPDATE/INSERT/ALTER/TRUNCATE
- BigInt serialization fix (Prisma COUNT/SUM → JSON.stringify con replacer)
- `convertToModelMessages()` (async) para convertir UIMessage[] → ModelMessage[], stripping `id`
- Markdown rendering: `react-markdown` + `@tailwindcss/typography` (prose-invert, text-xs)
- System prompt incluye schema BD completo + instrucciones horizonte temporal
- Variable de entorno: `ANTHROPIC_API_KEY` (en `.env.local` y Vercel)

**Re-geocoding (Nominatim)**
- Script `scripts/geocode-remaining.ts`: cascada dirección → CP → localidad
- 1.016 empresas actualizadas (de 1.025 procesadas): 233 nivel calle, 647 nivel CP, 136 nivel localidad, 9 sin resultado
- Respeta rate limit Nominatim (1.1s entre requests)

**Limpieza provincia/ccaa**
- 194 "Illes Balears" → "Baleares"
- 61 provincia="Cataluña" → provincia correcta (Barcelona, Tarragona, etc.)
- 37 null ccaa → rellenados desde mapeo provincia→ccaa
- 20 Madrid-area empresas con ccaa incorrecto → corregidas manualmente
- 18 mossos_registry sin dirección → asignadas a Barcelona/Cataluña

---

## 13. Variables de entorno

Plantilla en `.env.example` (raíz del proyecto, PR #17). Copiar a `.env.local` y rellenar.

```env
# .env.local
DATABASE_URL=postgresql://...        # Supabase (pooler)
DIRECT_URL=postgresql://...          # Supabase (migraciones)
NEXT_PUBLIC_MAPBOX_TOKEN=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000   # Producción: https://warroom.fontiber.com

# Admin war room (los finders NO usan estas variables — su auth es bcrypt
# contra tabla Finder, password seteada desde /finders)
ADMIN_USER_1=alberto
ADMIN_PASS_1=warroom2024
ADMIN_USER_2=gabriel
ADMIN_PASS_2=warroom2024

# Integraciones
PIPEDRIVE_API_KEY=...
ANTHROPIC_API_KEY=...                # Chat IA
RESEND_API_KEY=...                   # Emails
APISPAIN_KEY=...                     # BORME API

# Emails
SUMMARY_EMAIL_TO=alberto@fontiber.com,gabriel@fontiber.com
SUMMARY_EMAIL_FROM=warroom@fontiber.com

# Crons (solo en Vercel)
CRON_SECRET=...
```

---

## 14. Comandos útiles

```bash
# Desarrollo
npm run dev

# BORME
npx dotenv-cli -e .env.local -- npx tsx scripts/run-borme-today.ts 20260402   # Manual para fecha concreta
npx dotenv-cli -e .env.local -- npx tsx scripts/borme-test.ts                 # Test read-only
npx dotenv-cli -e .env.local -- npx tsx scripts/check-borme-today.ts          # Ver alertas creadas hoy

# CRM
npx dotenv-cli -e .env.local -- npx tsx scripts/check-crm-changes.ts          # Ver cambios CRM del día

# Email
npx dotenv-cli -e .env.local -- npx tsx scripts/test-email.ts                 # Email de prueba (7 días)

# PersonaCargo / Empresia
npx dotenv-cli -e .env.local -- npx tsx scripts/scrape-empresia.ts                        # Scraping completo
npx dotenv-cli -e .env.local -- npx tsx scripts/scrape-empresia.ts --cif B86743325        # Test empresa individual
npx dotenv-cli -e .env.local -- npx tsx scripts/scrape-empresia.ts --offset 500           # Reanudar desde posición
npx dotenv-cli -e .env.local -- npx tsx scripts/validate-empresia.ts                      # Validación 4 dimensiones
npx dotenv-cli -e .env.local -- npx tsx scripts/backfill-persona-cargo-borme.ts           # Backfill BORME para empresas sin empresia
npx dotenv-cli -e .env.local -- npx tsx scripts/backfill-persona-cargo-borme.ts --dry-run # Preview sin escribir

# Geocoding
npx dotenv-cli -e .env.local -- npx tsx scripts/geocode-remaining.ts              # Re-geocoding Nominatim (EJECUTADO 06/04/2026)

# Calidad de datos / Provincia
npx dotenv-cli -e .env.local -- npx tsx scripts/check-cp-mismatches.ts            # Detecta CP vs provincia inconsistentes
npx dotenv-cli -e .env.local -- npx tsx scripts/fix-provincia-aliases.ts          # Corrige aliases (Illes Balears, Lleida, Ourense)
npx dotenv-cli -e .env.local -- npx tsx scripts/fix-elecnor-provincia.ts          # Fix puntual Elecnor

# Reclasificaciones (ya ejecutadas, no repetir salvo nuevo backfill)
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/reclasificar-ceses.ts
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/reclasificar-posible-adquisicion.ts

# Build
npx next build
npx next lint
```

---

## 15. normalize.ts — Fuente de verdad para normalización (sesión 8)

Archivo: `src/lib/normalize.ts`. Importado por `scrape-empresia.ts`, `validate-empresia.ts`, y (futuro) el cron BORME.

```typescript
// Persona física: tokens ordenados alfabéticamente, sin partículas, sin tildes
normalizePersona("De La Pascua Aragón Pablo")  → "ARAGON PABLO PASCUA"
normalizePersona("Guitard Maldonado Álvaro")   → "ALVARO GUITARD MALDONADO"

// Persona jurídica (esJuridica=true): elimina sufijo, no reordena
normalizePersona("GRUFAEM SL", true)           → "GRUFAEM"
normalizePersona("FIRE BUSINESS, SL", true)    → "FIRE BUSINESS"

// BORME text search (NO para claves PersonaCargo)
normText("Administración y Gestión")           → "ADMINISTRACION Y GESTION"

// BORME personaDetectada → PersonaCargo key
bormePersonaToCargoKey("GUITARD MALDONADO ALVARO") → "ALVARO GUITARD MALDONADO"
```

> **Importante**: el campo `personas` en `GRUPOS_SENALES` usa formato BORME (orden natural + mayúsculas). Para buscar en PersonaCargo, pasar por `bormePersonaToCargoKey()`.

---

## 16. Notas técnicas críticas

- **force-dynamic**: todas las rutas API de datos deben tener `export const dynamic = "force-dynamic"`. Sin esto, Vercel puede cachear las respuestas.
- **Cron schedule (vercel.json)**: BORME a las 20:00 UTC (22:00 CEST) L-V. Email a las 06:00 UTC (08:00 CEST) Ma-Sa. Task digest a las 07:00 UTC L-V.
- **BORME cron procesa HOY**: desde el 01/04/2026 el cron usa la fecha del día en curso. A las 22:00 CEST el BORME del día ya está publicado y completo.
- **500 en endpoints cron — RESUELTO**: el endpoint `/api/cron/borme` devuelve **401** correctamente cuando se llama sin `Authorization: Bearer {CRON_SECRET}`. El CRON_SECRET solo está en Vercel (no en `.env.local`). Para sync manual usar los scripts locales.
- **Middleware**: excluye `login`, `daily`, `api/auth`, `api/cron`.
- **Resend init**: `new Resend(apiKey)` debe estar DENTRO de la función, no a nivel módulo.
- **reuseMaps + iconsReady**: con `reuseMaps` activo, `onLoad` no se dispara al remontar. Los iconos SDF se re-añaden en `handleIdle` con guard `map.hasImage()`.
- **pdf-parse v2**: `new PDFParse({ data: buffer }).getText()` — NO es `pdfParse(buffer)` de v1.
- **Scripts excluidos del tsconfig**: `"exclude": ["scripts"]`.
- **DealStage values (8)**: `"identificado"|"contactado"|"primera_reunion"|"analisis"|"LOI enviada"|"execution"|"portfolio"|"muerto"`.
- **Jitter coordenadas**: `getJitter(cif, axis)` — hash deterministico ±0.0004° (~44m).
- **Vercel build**: errores ESLint bloquean el build. Verificar con `npx next lint` antes de push.
- **Clasificación nombramiento vs cese**: la función `clasificarActo` en `borme.ts` detecta si el texto contiene CESE/REVOCACION sin NOMBRAMIENTO → clasifica como `otros`. El script `reclasificar-ceses.ts` aplicó esta lógica sobre el historial (854 alertas corregidas).
- **personas-compartidas — latest event wins**: para cada par (persona, empresa) se procesa la alerta más reciente (alertas en orden ASC). Si el último evento es revocación → `isActive=false`, si es nombramiento → `isActive=true`. Solo aparecen en el resultado pairs con `isActive=true`. Las alertas `otros` se incluyen en la query porque contienen las revocaciones.
- **Z-order Mapbox GL en JSX**: el source `empresas-bg` debe declararse ANTES que el source `empresas` para que los puntos grises queden por debajo de los pins activos cuando hay filtros aplicados.
- **borme-ring (pulse ámbar)**: solo se muestra si `hasBormeReciente=true` AND `enFiltro=true`. `hasBormeReciente` se activa solo para alertas de tipo fusion/adquisicion/posible_adquisicion en los últimos 7 días.
- **Regla BD**: la BD es single source of truth. Salvo casos extremos, nunca añadir empresas nuevas a la BD manualmente — solo desde fuentes oficiales (Excel, BORME). Las 5 empresas de seg. electrónica añadidas en sesión 7 son la excepción confirmada por el usuario.
- **Seg. electrónica — enPerimetro**: todas las empresas de sector `seguridad_electronica` (sin mixto) entran con `enPerimetro=true`. Las de sector `PCI` o `mixto` se gestionan desde el Excel de perímetro.
- **Chat IA — Vercel AI SDK v6**: usa `convertToModelMessages()` (async) para convertir UIMessage[] a ModelMessage[]. Requiere strip del campo `id`. BigInt de Prisma se serializa con replacer custom en JSON.stringify.
- **Chat IA — horizonte temporal**: el system prompt instruye a Claude a preguntar por horizonte temporal cuando la query implica datos temporales (BORME, financieros, CRM) y el usuario no especifica período.
- **Geocoding Nominatim**: cascada dirección→CP→localidad. Rate limit 1.1s. User-Agent: "Fontiber-WarRoom/1.0". Ejecutado para empresas id>3125 con dirección o CP (06/04/2026).
- **DealStage v2 — 9 valores** con `on_hold` añadido (por tareas ejecutadas en abril 2026). Valores actuales: `"identificado"|"contactado"|"primera_reunion"|"analisis"|"LOI enviada"|"execution"|"portfolio"|"on_hold"|"muerto"`.
- **Dos subdominios en un solo deployment**: `warroom.fontiber.com` (war room admin) y `portal.fontiber.com` (portal finders). El middleware enruta por host O por path (`/portal/*`, `/api/portal/*`). Vercel project único; NO duplicar deploys.
- **Filtro "Sin grupo" — sentinel `0` en `filtros.grupoId`**: el array `grupoId: number[]` admite el valor `0` para representar "empresas sin grupo asignado" (los IDs reales de `Grupo` son siempre positivos). `lib/filtros.ts` interpreta `0` como `p.grupoId === null`. El pill "Sin grupo" en el `Sidebar` y los chips activos lo etiquetan como tal en lugar de "Grupo: 0".
- **Etiqueta GM (gross margin)**: en TODA la UI usar "GM" / "GM%" — nunca "MB" ni "Margen bruto". Los identificadores internos (`margenBruto`, `margenBrutoPct`) sí mantienen el nombre por compatibilidad con Prisma/API. El comentario en `chat-schema.ts` instruye al Chat IA a responder al usuario con "GM".

---

## 17. Portal finders (MVP 1.5) — resumen operativo

Subdominio `portal.fontiber.com` construido en 4 PRs (#11-#14, cerrados 2026-04-24).

### Flujo de alta de un finder

Desde PR #26 (2026-04-28) la creación es íntegra desde la web — antes solo vía SQL/script.

1. Admin entra a `/finders` y pulsa **+ Nuevo finder**. Modal con nombre, email, comisión opcional, password inicial (input editable + botón "Generar" para una aleatoria de 14 chars).
2. `POST /api/finders` (zod `FinderCreateSchema`) crea el registro con bcrypt hash + `passwordSetAt=now` en una transacción. Email único — 409 si choca.
3. La password se enseña **una sola vez** con botón "Copiar". Admin la pasa al finder por canal seguro (WhatsApp/Signal). No se vuelve a mostrar.
4. Finder entra en `portal.fontiber.com`, formulario email + password.

### Edición y desactivación de finders (PR #29, 2026-04-29)

- Cada fila de `/finders` lleva botón **Editar** → modal con nombre, email, comisión y toggle activo/inactivo.
- `PATCH /api/finders/:id` (`FinderUpdateSchema`): todos los campos opcionales pero al menos uno. Email único (409 si choca).
- `active=false` no permite login (el provider `finder-credentials` en `auth.ts` rechaza `!finder.active`); las filas inactivas aparecen atenuadas.
- `GET /api/finders` acepta `?includeInactive=1` para listar todos. La página `/finders` lo pasa; el resto de consumidores (selector "asignar a finder" en la ficha de empresa) sigue recibiendo solo activos.

### Gestión de password (PRs #26 + #27, 2026-04-28)

- Antes el modal de password auto-generaba una nueva cada vez al abrir. Ahora muestra **"Fijada el {fecha}"** y un botón explícito **"Cambiar password"** que entra en modo edición con input vacío + "Generar". Permite abrir el modal sin riesgo.
- La password ya almacenada **no es recuperable** (bcrypt). Si el finder la perdió, hay que rotarla → se enseña una vez, se copia, se envía.
- `POST /api/finders/:id/password` releé el registro tras `update` y devuelve `{ok, passwordSetAt}` para que el cliente falle loud si el pool de Supabase no confirmó el write.

### Qué ve el finder (portal.fontiber.com)

- **Kanban `/portal`** con 6 estados agregados: `Pendiente` / `Contactado` / `En negociación` / `Cerrado` / `En pausa` / `Descartado` (mapeados desde los 9 stages internos vía `FINDER_STATUS_MAP` en `src/lib/crm.ts`). NUNCA se expone el stage interno real.
- **Ficha `/portal/empresas/:id`** filtrada: nombre, sector, provincia/localidad, web, linkedin, descripción, status agregado. NO ve CIF, financieros, grupo, owner admin, BORME, CrmLog ni notas internas (salvo `Nota.visibleAFinder=true`).
- **Proponer target `/portal/proponer`** con autocomplete neutro ("Sugerencias"). No avisa de duplicados en realtime ni bloquea submit; siempre devuelve "Propuesta enviada".

### Reglas de escritura del finder

- **Crear** notas, tareas y actividades sobre sus targets asignados (`finderSourceId === finder.id`). `autorFinderId` queda seteado automáticamente. Si crea una tarea se autoasigna (`asignadoFinderId = finder.id`).
- **Editar / borrar**: solo lo propio y dentro de la ventana de 24h desde `createdAt` (constante `PORTAL_EDIT_WINDOW_MS` en `src/lib/finder-session.ts`). Pasada la ventana → 403, debe añadir entrada nueva.
- **Completar tarea**: toggle de `completada` permitido al finder si es autor O asignado, sin límite de 24h.
- Las tareas que el finder le asigna un admin (caso no implementado en UI, pero posible desde scripts) solo permiten toggle; el finder no puede editar título/descripción.

### Qué ve el admin de las aportaciones del finder

- En `PanelEmpresa`/`CrmSections` del war room, cada nota/tarea/entrada del historial cuya autoría sea de un finder lleva un `<FinderBadge>` (chip ámbar con icono). Los admins **no pueden editar ni borrar** las entradas del finder desde la UI (para no colisionar con su ventana 24h).
- En `/finders/proposals`, las propuestas aparecen en `PENDING` por defecto. El GET admin calcula `dedupMatch` on-the-fly (CIF exacto + nombre normalizado contra el universo); si hay coincidencia, la tarjeta lleva un badge ámbar **"Posible duplicado: {empresa} ({CIF})"**. El admin decide manualmente `ACCEPTED / DUPLICATE / OUT_OF_SCOPE / REJECTED`. `rejectionReason` es campo interno — nunca se expone al finder.

### Dedup propuestas (silencioso al finder)

1. `POST /api/portal/proposals` siempre crea `TargetProposal` con `status=PENDING`, independientemente de si hay match.
2. El `GET` del admin (`/api/admin/proposals`) calcula `dedupMatch` en cada request: normalización `normalizePersona(name, true)` + CIF exacto.
3. El label `DUPLICATE` se renderiza como **"Cerrada"** en el historial del finder (`PortalProposeClient`), como **"Ya existía"** en el admin (`ProposalsAdminClient`). Esto protege la info de seguimiento interno incluso post-hoc.

### Middleware

`src/middleware.ts` detecta zona portal por **tres vías**:
1. Host = `portal.fontiber.com` (producción).
2. Path empieza por `/portal/*` o `/api/portal/*` (refuerzo, siempre portal aunque el host no coincida).
3. `?portal=1` o header `x-test-portal: 1` en NODE_ENV !== production (testing local).

En zona portal exige `session.kind === "finder"` → sino redirect a `/portal/login`. En zona war room bloquea sesiones finder → redirect `/login?wrongPortal=1`.

**Orden de chequeos dentro de zona portal con sesión finder** (importa — fix PR #118):
1. Si `path === "/"` → rewrite a `/portal` (dashboard). Va **antes** del check de defensa en profundidad, sino la raíz cae en 404.
2. Defensa en profundidad: si `path` NO está en `/portal`, `/portal/*`, `/api/portal/*`, `/api/auth`, ni rutas públicas del portal → `NextResponse.json({error:"Not found"}, {status:404})`. Bloquea a un finder de llamar a APIs admin aunque el endpoint mismo no lo valide.

Si añades una ruta nueva del portal, añadirla al check `isPortalRoute` o al set `isPortalPublic` para que el middleware no la corte.

### Auth (NextAuth — `src/lib/auth.ts`)

Dos CredentialsProviders:
- `admin-credentials` (user+password via ENV `ADMIN_USER_1/2` + `ADMIN_PASS_1/2`) — para Alberto y Gabriel.
- `finder-credentials` (email+password bcrypt contra tabla `Finder`) — para finders externos.

Callback `jwt` guarda `token.kind` y `token.finderId`. Callback `session` los lee. Fallback: token sin `kind` → `admin` (para sesiones pre-PR #11, antes del rollout del portal).

### Access log

`src/lib/finder-access-log.ts` → `logFinderAction({finderId?, email?, action, resourceId?, ip?, userAgent?})`. Fire-and-forget excepto en el `authorize` de NextAuth donde va con `await` (en serverless de Vercel un `return null` puede terminar la lambda antes del INSERT).

Acciones registradas tras PR #119 (2026-05-15):

- `login_success` / `login_failure` — `login_failure` también se emite cuando el email no existe (`finderId=null`, email en la columna). Captura `ip` (de `x-forwarded-for` o `x-real-ip`) y `userAgent`.
- `view_deals` (carga Kanban `/portal`)
- `view_deal` (abre ficha target)
- `add_note` / `edit_note` / `delete_note`
- `add_task` / `edit_task` / `complete_task` / `delete_task`
- `propose_target` / `propose_target_duplicate`
- `add_activity` (legacy, no se emite desde la fusión Actividad+Tarea en PR #39)

**Semántica de `resourceId` por acción** (importante para `actividad_finders` del chat IA):
- `view_deal` → `Empresa.id`
- `*_note` → `Nota.id`
- `*_task` → `Tarea.id`
- `propose_target*` → `TargetProposal.id`
- `login_*`, `view_deals` → null (el contexto del login va en `email`)

**Consulta desde el chat IA admin** (PR #119): tools `actividad_finders(finderName?, action?, desde?, hasta?, limit?)` y `resumen_actividad_finders(desde?, hasta?, agruparPor)`. Resuelven el JOIN a Empresa según el tipo de acción. Preferir estos tools antes que `execute_sql` contra la tabla cruda.

**Índices DB** (aplicados a prod 2026-05-15 con `CREATE INDEX CONCURRENTLY`):
- `[finderId]` (legacy)
- `[finderId, createdAt]` — query típica "qué hizo X entre fechas"
- `[action, createdAt]`
- `[createdAt]` — rangos sin filtro de finder
- `[email]` — patrón "intentos con email X"

### Modelo de datos clave

```prisma
model Finder {
  id              String   @id @default(cuid())
  email           String   @unique
  name            String
  active          Boolean  @default(true)
  commissionPct   Float?
  passwordHash    String?         // bcrypt; null = sin acceso al portal
  passwordSetAt   DateTime?
  // Relaciones inversas: empresas (targets asignados), notasAutor, tareasAutor,
  // tareasAsignadas, actividadesAutor, crmLogsAutor, proposals, accessLogs.
}

model Nota {
  // autorId | autorFinderId (mutex) — uno de los dos siempre rellenado.
  visibleAFinder  Boolean  @default(false)  // admin decide si compartir
}

model Tarea {
  // autorId | autorFinderId, asignadoId | asignadoFinderId
}

model Actividad / CrmLog {
  // autorId | autorFinderId
}
```

Campo `autorId` de `Nota` y `Tarea` pasó a `nullable` en PR #11 para permitir el doble autor (User o Finder). Es compatible con datos existentes.

### Diseño confidencial — cosas a NO romper

- **Nunca** exponer `pipedriveOrgId`, `financieros`, `grupoId`, `ownerUserId`, `BORME`, `CrmLog` ni el stage interno real al finder.
- **Nunca** revelar si una empresa está en seguimiento: el dedup de propuestas es silencioso, el label `DUPLICATE` se enmascara como "Cerrada", el autocomplete del form muestra "Sugerencias" (nombre genérico) sin información de estado.
- **Siempre** filtrar por `finderSourceId === finder.id` AND `esAnonima=false` en todos los endpoints del portal. Leads anónimos (que vienen de Deale, otro finder fuera del portal) no existen para los finders del portal.

---

## 18. Notificaciones in-app + email (PR #25, 2026-04-28)

Sistema genérico para notificar a admins de eventos discretos. Por ahora solo se emite `tipo: "proposal_new"` desde `POST /api/portal/proposals`, pero el modelo soporta futuros tipos (`task_due`, `borme_signal`, etc.) sin migración.

### Modelo

```prisma
model Notificacion {
  id        Int       @id @default(autoincrement())
  userId    String
  user      User      @relation(...)
  tipo      String    // "proposal_new" (futuros: "task_due", "borme_signal", ...)
  titulo    String
  mensaje   String    @db.Text
  link      String?   // ruta interna del war room (ej. "/finders/proposals?status=PENDING")
  leida     Boolean   @default(false)
  leidaAt   DateTime?
  createdAt DateTime  @default(now())

  @@index([userId, leida, createdAt])
}
```

### Helper `notifyAdmins` (`src/lib/notifications.ts`)

Recibe `{ tipo, titulo, mensaje, link?, email? }`. Pasos:

1. Lee `User where role="admin" AND active=true`.
2. `prisma.notificacion.createMany` — una fila por admin.
3. Si `email !== false` y hay `RESEND_API_KEY`, envía email vía Resend (mismo `FROM` que los digests).
4. Recipientes: por defecto los emails de los admins. Se pueden override con env `NOTIFICATION_EMAIL_TO` (CSV) — útil mientras solo Alberto recibe; cuando entre Gabriel basta con quitar el override.

Fire-and-forget: si Resend falla solo loguea, no rompe la operación que disparó la notificación.

### Endpoint `/api/notificaciones`

- `GET ?unreadOnly=1&limit=20` → `{ items, unreadCount }` filtrado por session user. Solo `kind === "admin"`.
- `PATCH` body `{ ids: number[] }` o `{ markAllRead: true }` → marca leídas (con `leidaAt`).

### UI — `NotificationsBell` en topbar

- Componente cliente entre el botón de modo presentación y el de finders.
- Polling cada 30s contra `/api/notificaciones?limit=10`.
- Badge rojo con count de no-leídas (>9 → "9+").
- Click abre dropdown 360px con últimas 10. Click en una notificación marca leída (optimista) y navega al `link`.
- Botón "Marcar todas leídas" llama PATCH con `markAllRead: true`.

### Hook actual: `proposal_new`

`POST /api/portal/proposals` tras `logFinderAction` invoca:

```ts
notifyAdmins({
  tipo: "proposal_new",
  titulo: `Nueva propuesta de ${finder.name}: ${companyName}${duplicado ? " (posible duplicado)" : ""}`,
  mensaje: `…\n\nEmpresa: …\nCIF: …\n\nRevísala desde Propuestas de finders.`,
  link: "/finders/proposals?status=PENDING",
});
```

Fire-and-forget con `.catch(...)` — la propuesta + log pasan siempre aunque la notificación falle.

---

## 19. Refresco automático tras mutaciones (bus `wr:data-changed`, PR #120, 2026-05-15)

Bus de invalidación cliente para que cualquier lista refresque sin que el usuario pulse `F5` tras guardar. Sustituye a `wr:empresa-changed` (que solo cubría entidades bajo Empresa).

### Convención obligatoria para nuevos formularios

1. **En el endpoint GET de la lista**, NO añadir `Cache-Control: max-age>0`. El navegador cachea y esconde mutaciones recientes. Si la entidad puede mutarse desde la UI, sin cache HTTP.
2. **Tras cada mutación cliente exitosa**, dispatchear:
   ```ts
   dispatchDataChanged({
     resource: "finder",         // ResourceKind
     resourceId: id,
     action: "update",            // "create" | "update" | "delete"
     source: "Componente/handler",
   });
   ```
3. **En componentes que muestran la lista**, suscribirse en un `useEffect`:
   ```ts
   useEffect(() => subscribeDataChanged({ resource: "finder" }, () => load()), []);
   ```
4. **Para entidades anidadas** (tarea bajo empresa), añadir `parent: { resource: "empresa", id }` tanto al dispatch como al filter del subscribe.

### `ResourceKind` actuales

Top-level: `empresa`, `finder`, `grupo`, `user`, `propuesta`, `notificacion`.
Bajo empresa: `tarea`, `nota`, `stage`, `contacto`, `documentacion`.

### Módulo

`src/lib/data-events.ts` exporta `DATA_CHANGED_EVENT`, `dispatchDataChanged()`, `subscribeDataChanged(filter, callback)` con filtro tipado AND (resource + resourceId + action + parent).

### Pre-flight antes de push

Si una PR añade/quita imports o toca client components con hooks de routing, **correr `npm run build` localmente antes del push** — no basta `tsc --noEmit` + vitest. ESLint estricto de `next build` pilla imports unused (`@typescript-eslint/no-unused-vars`) y errores de Suspense que los otros silencian. El PR #120 falló en Vercel la primera vez por un import unused en `PipelinePageClient.tsx`.
