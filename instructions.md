# Fontiber War Room — Instrucciones para Claude

Documento de contexto para continuar el desarrollo entre conversaciones.
Actualizado: 2026-04-06 (sesión 9)

---

## 1. Qué es este proyecto

**War Room** es un dashboard interno de M&A para Fontiber, orientado al sector de PCI (protección contra incendios) y seguridad electrónica en España.

- Universo actual: **~5.140 empresas** (PCI + seg. electrónica + mixtas)
- Stack: Next.js 14 App Router · TypeScript · Prisma · PostgreSQL (Supabase) · Zustand · react-map-gl / Mapbox GL JS · Tailwind CSS · Vercel AI SDK + Claude
- Tema visual: oscuro, estilo "war room"
- Auth: NextAuth (credentials — alberto/gabriel)
- Deploy: Vercel → **https://warroom.fontiber.com** (dominio propio, activo)
- Repo: https://github.com/albertofontiber/war-room (privado, CI/CD automático)

---

## 2. Estructura de archivos clave

```
src/
  app/
    page.tsx                              # Dashboard principal (requiere auth)
    daily/[fecha]/page.tsx                # Resumen diario público (sin auth)
    api/
      empresas/route.ts                   # GET — GeoJSON de todas las empresas (force-dynamic)
      empresas/[id]/route.ts              # GET — detalle de empresa (force-dynamic)
      empresas/[id]/perimetro/            # PATCH — toggle enPerimetro (force-dynamic)
      empresas/[id]/grupo/                # PATCH — asigna/crea grupo
      grupos/route.ts                     # GET — lista todos los grupos (autocomplete)
      chat/route.ts                       # POST — Chat IA streaming (Claude + SQL tools) (sesión 9)
      borme/
        operaciones/route.ts              # GET — señales M&A enriquecidas (force-dynamic)
        personas-compartidas/route.ts     # GET — personas en 2+ empresas activas (force-dynamic)
        recientes/route.ts                # GET — todos los actos BORME últimos 90 días
      cron/
        borme/route.ts                    # GET — cron BORME (L-V 20:00 UTC = 22:00 CEST)
        pipedrive/route.ts                # GET — cron Pipedrive (L-V 20:00 UTC = 22:00 CEST)
        daily-summary/route.ts            # GET — cron email resumen (Ma-Sa 06:00 UTC)
        task-digest/route.ts              # GET — cron tareas por usuario (L-V 07:00 UTC)
  components/
    ChatIA.tsx                            # Chat IA flotante — Claude + SQL sobre datos War Room + CRM (sesión 9, schema CRM ampliado abril 2026)
    WarRoomLayout.tsx                     # Layout raíz — renderiza Mapa | Tabla | Operaciones | Grupos + ChatIA
    PipelinePageClient.tsx                # Kanban CRM + filtros + ChatIA (montado también aquí)
    MapaEspana.tsx                        # Mapa Mapbox con clusters, marcadores, selección área
    Navbar.tsx                            # Barra superior — toggle Mapa/Tabla/Operaciones/Grupos + búsqueda
    Sidebar.tsx                           # Filtros + estadísticas (8 stages CRM + filtro Grupo)
    TablaEmpresas.tsx                     # Tabla con sorting, columna CIF y export Excel
    PanelEmpresa.tsx                      # Panel lateral detalle empresa
    OperacionesBorme.tsx                  # Vista Operaciones M&A (señales + alertas personas + actividad)
    GruposView.tsx                        # Vista Grupos — tabla de grupos con empresas y financieros
  lib/
    borme.ts                              # Lógica BORME: fetch, parse, classify, process ⭐
    borme-senales.ts                      # Catálogo señales por grupo (personas + keywords) ⭐
    chat-schema.ts                        # Schema BD + system prompt para Chat IA (sesión 9) ⭐
    normalize.ts                          # Fuente de verdad normalización nombres ⭐ (sesión 8)
    email-daily-summary.ts                # Email mínimo: 3 cifras + link a /daily/[fecha] (Resend)
    email-task-digest.ts                  # Email por usuario: vencidas + hoy + próximos 7 días (Resend)
    validation.ts                         # Schemas zod para bodies de endpoints CRM (tareas, notas, stage, finder, perímetro, grupo)
    *.test.ts                             # Suite vitest (lib/crm, lib/format, lib/validation — 47 tests)
    filtros.ts                            # isInFilter()
    prisma.ts                             # Singleton PrismaClient
  store/
    useWarRoomStore.ts                    # Zustand store central (Vista: "mapa"|"tabla"|"operaciones"|"grupos")
  types/index.ts                          # Tipos + FILTROS_DEFAULT + DealStage (8 valores)
  middleware.ts                           # Auth middleware — excluye: login, daily, api/auth, api/cron

prisma/schema.prisma                      # Modelos BD

scripts/
  borme-backfill.ts                       # Backfill 6 meses (EJECUTADO 29/03/2026 — 1.223 alertas)
  borme-backfill-2años.ts                 # Backfill 2 años (EJECUTADO 02/04/2026 — datos desde 01/04/2024)
  borme-backfill-grupos.ts                # Re-clasifica alertas + asigna grupos (EJECUTADO 30/03/2026)
  borme-test.ts                           # Test diario read-only
  borme-buscar-empresa.ts                 # Buscar empresa en historial BORME
  run-borme-today.ts                      # Ejecutar BORME manualmente: npx dotenv-cli -e .env.local -- npx tsx scripts/run-borme-today.ts YYYYMMDD
  run-pipedrive.ts                        # Ejecutar Pipedrive sync manualmente (CIF-first matching)
  check-pipedrive-unmatched.ts            # Muestra deals Dealflow sin match en BD (activos vs cerrados)
  check-crm-changes.ts                    # Ver cambios CRM del día + último log
  check-borme-today.ts                    # Ver alertas BORME creadas hoy con tipo y fecha
  pipedrive-sync.ts                       # Sync Pipedrive → CrmEstado (idempotente) — 155 matches
  import-grupos-perimetro.ts              # Importa grupos y perímetro desde Excel (29/03/2026)
  import-seg-electronica.ts              # Importa empresas seg. electrónica (29/03/2026 — 666 nuevas)
  import-financieros-seg-electronica.ts   # Importa financieros seg. electrónica desde Excel (02/04/2026)
  reclasificar-ceses.ts                   # Reclasifica alertas nombramiento→otros si son ceses puros (EJECUTADO 02/04/2026 — 854 reclasificadas)
  reclasificar-posible-adquisicion.ts     # Reclasifica nombramiento_grupo→posible_adquisicion si empresa no pertenece al grupo (EJECUTADO — 0 cambios)
  find-empresa.ts                         # Buscar empresa en DB por nombre
  test-email.ts                           # Envía email de prueba con datos de los últimos 7 días
  scrape-empresia.ts                      # Scraping empresia.es → PersonaCargo + enriquece Empresa (sesión 8) ⭐
  validate-empresia.ts                    # Validación 4D del scraping: cobertura, CP/prov, personas conocidas, personas múltiples (sesión 8)
  check-cataluna.ts                       # Cross-reference empresas Cataluña vs BD (sesión 8)
  insert-cataluna.ts                      # Inserta 102 nuevas + actualiza 36 PCI→mixto + M.Boada enPerimetro (EJECUTADO 05/04/2026)
  enrich-cataluna.ts                      # Enriquece 84 empresas catalanas con web/linkedin/telefono/descripcion (EJECUTADO 05/04/2026)
  geocode-remaining.ts                   # Re-geocoding 1.025 empresas (id>3125) con Nominatim: dirección→CP→localidad (EJECUTADO 06/04/2026)
  check-cp-mismatches.ts                  # Detecta inconsistencias CP vs provincia: aliases (87) + errores genuinos (36) (sesión 8)
  fix-provincia-aliases.ts               # Corrige 271 alias: Illes Balears→Baleares, Lleida→Lérida, Ourense→Orense (EJECUTADO 05/04/2026)
  fix-elecnor-provincia.ts               # Fix puntual: ELECNOR, S.A. Sevilla→Madrid (EJECUTADO 05/04/2026)
  backfill-persona-cargo-borme.ts        # Backfill PersonaCargo desde BORME para empresas sin datos empresia (sesión 8) ⭐

vercel.json                               # Crons: Pipedrive + BORME 20:00 L-V · Resumen 06:00 Ma-Sa · Task digest 07:00 L-V (UTC)
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
- **Pipedrive sync**: 155 empresas sincronizadas con dealStage y owner ✅
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
- **Email resumen diario**: cron Ma-Sa 06:00 UTC → email con 3 cifras + link a /daily/[fecha] ✅
- **Email task-digest por usuario**: cron L-V 07:00 UTC → tareas vencidas, hoy y próximos 7 días (1 email por usuario activo con tareas asignadas) ✅
- **Badge de tareas pendientes**: visible en Kanban (ya existía), tooltip del mapa y filas de la tabla (`XT` en ámbar) ✅
- **Página /daily/[fecha]**: pública (sin login), resumen completo con diseño War Room ✅
- **force-dynamic en todas las rutas API**: garantiza datos frescos, sin caché de Vercel ✅

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

## 7. Integración Pipedrive ✅ COMPLETADA

### Estado (02/04/2026)

**169 empresas** sincronizadas. Cron diario: L-V 20:00 UTC (22:00 CEST) → `/api/cron/pipedrive`.

| Stage Pipedrive | stage_id | War Room `dealStage` |
|---|---|---|
| Identificado | 6 | `identificado` |
| Contactado | 7 | `contactado` |
| 1ª reunión realizada | 8 | `primera_reunion` |
| Análisis | 9 | `analisis` |
| LOI enviada | 10 | `LOI enviada` |
| Execution | 11 | `execution` |
| Portfolio | 12 | `portfolio` |
| status=lost | — | `muerto` |

Pipeline sincronizado: **Dealflow (id=1, stages 6-12)**. El pipeline "Fundraising" (id=2, stages 13-16) es para captación de capital propio → **ignorado por completo**.

Matching (por prioridad):
1. **CIF** — campo personalizado en el deal (`CIF_FIELD_KEY = "f7524d9f2b0ba3ec93adfd71bf8c6135d9c42d00"`)
2. **pipedriveOrgId** — vinculado previamente en CrmEstado
3. **Nombre normalizado exacto**
4. **Core nombre** — sin forma jurídica (SA, SL, etc.)

**Fix parentéticos** (sesión 5): antes de normalizar el nombre de Pipedrive se eliminan los alias entre paréntesis.

**CIF en deals Dealflow**: campo personalizado "CIF" existente en el pipeline Dealflow. NO crear campos nuevos ni a nivel de organización. Añadir CIF directamente al deal para garantizar matching fiable.

**Nota sobre CrmLog**: a partir del 02/04/2026 el cron genera logs de cambios de stage. Los primeros 12 registros se crearon ese día.

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
22:00 CEST (L-V)  →  BORME del día + Pipedrive sync  →  Supabase
08:00 CEST (Ma-Sa) →  Email con 3 cifras + link  →  /daily/YYYY-MM-DD (página pública)
```

### Email (`src/lib/email-daily-summary.ts`)

- **Cron**: Ma-Sa 06:00 UTC (08:00 CEST) → `GET /api/cron/daily-summary`
- **Librería**: Resend — init **dentro** de la función (no a nivel módulo)
- **Destinatario**: `SUMMARY_EMAIL_TO` (default: alberto@fontiber.com)
- **Contenido**: 3 cifras (señales BORME, fus/adq/posible, alertas personas) + botón "Ver resumen completo →"
- **Enlace**: `warroom.fontiber.com/daily/YYYY-MM-DD` (fecha = día anterior = día de los datos)

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
  pipedriveOrgId String?
  dealStage      String?
  owner          String?
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

```env
# .env.local
DATABASE_URL=postgresql://...        # Supabase
DIRECT_URL=postgresql://...          # Supabase (migraciones)
NEXT_PUBLIC_MAPBOX_TOKEN=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000   # Producción: https://warroom.fontiber.com
ADMIN_USER_1=alberto
ADMIN_PASS_1=warroom2024
ADMIN_USER_2=gabriel
ADMIN_PASS_2=warroom2024
PIPEDRIVE_API_KEY=...
RESEND_API_KEY=...                   # Configurado en Vercel ✅
CRON_SECRET=...                      # Configurado en Vercel ✅
ANTHROPIC_API_KEY=...                # Chat IA — Configurado en Vercel ✅ (sesión 9)
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

# Pipedrive
npx dotenv-cli -e .env.local -- npx tsx scripts/run-pipedrive.ts              # Sync manual
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
- **Cron schedule (vercel.json)**: Pipedrive + BORME a las 20:00 UTC (22:00 CEST) L-V. Email a las 06:00 UTC (08:00 CEST) Ma-Sa.
- **BORME cron procesa HOY**: desde el 01/04/2026 el cron usa la fecha del día en curso. A las 22:00 CEST el BORME del día ya está publicado y completo.
- **500 en endpoints cron — RESUELTO**: los endpoints `/api/cron/borme` y `/api/cron/pipedrive` devuelven **401** correctamente cuando se llaman sin `Authorization: Bearer {CRON_SECRET}`. El CRON_SECRET solo está en Vercel (no en `.env.local`). Para sync manual usar los scripts locales.
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
- **Pipedrive — solo Dealflow**: el funnel de Fundraising (pipeline_id=2, stages 13-16) se ignora completamente. Solo existe el Dealflow (pipeline_id=1, stages 6-12). Los ~80 deals de FOs/inversores en stages 13-16 del mismo pipeline Dealflow tampoco se sincronizan (no matchean con empresas de la BD — correcto).
- **Regla BD**: la BD es single source of truth. Salvo casos extremos, nunca añadir empresas nuevas a la BD manualmente — solo desde fuentes oficiales (Excel, BORME). Las 5 empresas de seg. electrónica añadidas en sesión 7 son la excepción confirmada por el usuario.
- **Seg. electrónica — enPerimetro**: todas las empresas de sector `seguridad_electronica` (sin mixto) entran con `enPerimetro=true`. Las de sector `PCI` o `mixto` se gestionan desde el Excel de perímetro.
- **Chat IA — Vercel AI SDK v6**: usa `convertToModelMessages()` (async) para convertir UIMessage[] a ModelMessage[]. Requiere strip del campo `id`. BigInt de Prisma se serializa con replacer custom en JSON.stringify.
- **Chat IA — horizonte temporal**: el system prompt instruye a Claude a preguntar por horizonte temporal cuando la query implica datos temporales (BORME, financieros, CRM) y el usuario no especifica período.
- **Geocoding Nominatim**: cascada dirección→CP→localidad. Rate limit 1.1s. User-Agent: "Fontiber-WarRoom/1.0". Ejecutado para empresas id>3125 con dirección o CP (06/04/2026).
