# Fontiber War Room — Instrucciones para Claude

Documento de contexto para continuar el desarrollo entre conversaciones.
Actualizado: 2026-04-02 (sesión 6)

---

## 1. Qué es este proyecto

**War Room** es un dashboard interno de M&A para Fontiber, orientado al sector de PCI (protección contra incendios) y seguridad electrónica en España.

- Universo actual: **5.017 empresas** (PCI + seg. electrónica + mixtas)
- Stack: Next.js 14 App Router · TypeScript · Prisma · PostgreSQL (Supabase) · Zustand · react-map-gl / Mapbox GL JS · Tailwind CSS
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
      borme/
        operaciones/route.ts              # GET — señales M&A enriquecidas (force-dynamic)
        personas-compartidas/route.ts     # GET — personas en 2+ empresas activas (force-dynamic)
        recientes/route.ts                # GET — todos los actos BORME últimos 90 días
      cron/
        borme/route.ts                    # GET — cron BORME (L-V 20:00 UTC = 22:00 CEST)
        pipedrive/route.ts                # GET — cron Pipedrive (L-V 20:00 UTC = 22:00 CEST)
        daily-summary/route.ts            # GET — cron email (Ma-Sa 06:00 UTC = 08:00 CEST)
  components/
    WarRoomLayout.tsx                     # Layout raíz — renderiza Mapa | Tabla | Operaciones | Grupos
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
    email-daily-summary.ts                # Email mínimo: 3 cifras + link a /daily/[fecha] (Resend)
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
  run-pipedrive.ts                        # Ejecutar Pipedrive sync manualmente
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

vercel.json                               # Crons: Pipedrive + BORME 20:00 UTC L-V · Email 06:00 UTC Ma-Sa
```

---

## 3. Funcionalidades completadas ✅

- Mapa Mapbox con 5.017 empresas, clusters, marcadores por sector/prioridad
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
- **Seguridad electrónica importada**: 666 nuevas + 399 mixtas, total 5.017 empresas ✅
- **Financieros seg. electrónica**: 579 empresas macheadas, 1.331 registros financieros, 422 CPs geocodificados ✅
- **Grupos editables desde panel**: sección GESTIÓN (ámbar) con autocomplete + "Crear nuevo" ✅
- **Clusters como donut pie chart**: proporciones de etapas CRM visibles en cada cluster ✅
- **Filtro de Grupo en Sidebar**: pills para cada grupo, chips activos en la barra de filtros ✅
- **Vista Grupos**: nueva pestaña en Navbar con tabla de grupos y sus empresas ✅
- **Exportar tabla a Excel**: botón en toolbar de la vista Tabla ✅
- **Email resumen diario**: cron Ma-Sa 06:00 UTC → email con 3 cifras + link a /daily/[fecha] ✅
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
  - Devuelve señales operacionales (fusion + adquisicion + cambio_denominacion + nombramiento_grupo)
  - Enriquecidas con: financieros del año más reciente, grupoInferido, adquirente extraído del texto
  - Calcula `efectiveTipo` (posible_adquisicion / nombramiento)
  - Deduplicación por (empresaId, día): conserva el tipo de mayor prioridad
- **Botón refresh** (↻) para forzar re-fetch sin recargar página
- **Tabla compacta** sortable por fecha / ingresos / EBITDA%
  - Columnas: Fecha | Tipo | Empresa (⊕ perímetro, link web) | Adquirente | Ingresos | EBITDA | MB% | BORME↗
  - Click en fila → expande descripción inline
  - Filas `posible_adquisicion` con fondo naranja tenue
- **Filtros de tipo**: Fusión / Adquisición / Posible adq. / Rebranding (pills)
- **Filtro de fecha**: desde / hasta
- **Filtros del sidebar** (enPerimetro, CCAA, provincia, sector, grupoId, ingresos) → aplicados client-side

### Sub-tab "Alertas personas"

- **API**: `GET /api/borme/personas-compartidas`
  - Extrae nombres de personas de los textos BORME (patrón "Rol: NOMBRE APELLIDO")
  - Distingue secciones de NOMBRAMIENTO vs CESE/REVOCACION/DIMISION/BAJA mediante marcadores posicionales
  - **Lógica "latest event wins"**: por cada par (persona, empresa) se guarda el evento más reciente; si es revocación → `isActive=false`; si es nombramiento → `isActive=true`
  - Solo aparecen en el resultado personas con `isActive=true` en ≥2 empresas distintas
  - Incluye alertas de `tipoActo = "otros"` (donde viven las revocaciones tras el backfill) además de nombramientos
  - Excluye personas ya en GRUPOS_SENALES (conocidas)
  - Incluye `urlBorme` del nombramiento activo para cada (persona, empresa)
  - REJECT_WORDS extendido: INISTRACION, INISTRADOR, CONCURSAL, SOCIEDAD, CONSTITUCION (fragmentos truncados del BORME)
- **Tabla colapsable** por persona:
  - Fila colapsada: Persona | Empresas (count) | En perímetro | Ingresos totales | Última incorporación
  - Fila expandida (por empresa): Empresa (clickable + grupo pill + web icon) | Rol | Ingresos | EBITDA·GM% | Fecha·BORME↗
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

### Estado (01/04/2026)

**155 empresas** sincronizadas. Cron diario: L-V 20:00 UTC (22:00 CEST) → `/api/cron/pipedrive`.

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

Pipeline sincronizado: **Dealflow (id=1)**. El pipeline "Fundraising" (id=2) es para captación de capital propio → NO se sincroniza.

Matching: pipedriveOrgId (primario) → nombre normalizado exacto → core sin forma jurídica.

**Fix parentéticos** (sesión 5): antes de normalizar el nombre de Pipedrive se eliminan los alias entre paréntesis.

**Nota sobre CrmLog**: la tabla existe en el schema pero está vacía — el sync solo crea logs cuando detecta cambios de stage respecto al estado anterior. Al ser la primera ejecución con la tabla vacía, no generó logs. A partir de ahora sí los generará.

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

### Estado sesión 02/04/2026

| # | Tarea | Prioridad | Estado | Notas |
|---|---|---|---|---|
| A | Importar seg. electrónica | Alta | ✅ | 666 nuevas + 399 mixtas |
| B | Actualizar grupos desde Excel | Alta | ✅ | 5 grupos |
| C | Actualizar perímetro desde Excel | Alta | ✅ | 1.552 in / 2.805 out |
| D | Editar grupo desde panel lateral | Alta | ✅ | Sección GESTIÓN + autocomplete |
| F | Cross-referencing BORME (personas) | Alta | ✅ | Catálogo señales + backfill |
| G | Dashboard Operaciones M&A | Alta | ✅ | 3 sub-tabs |
| K | Exportar tabla a Excel | Media | ✅ | |
| L | Vista Grupos | Baja | ✅ | Nueva pestaña en Navbar |
| M | posible_adquisicion en BD | Media | ✅ | nombramiento_grupo → posible_adquisicion si empresa no es del grupo |
| N | CRM 8 etapas | Alta | ✅ | |
| O | Email resumen diario | Alta | ✅ | 3 cifras + link a /daily/[fecha] |
| P | Ampliar backfill BORME a 2 años | Alta | ✅ | Ejecutado 02/04/2026 |
| Q | Financieros seg. electrónica | Alta | ✅ | 579 empresas, 1.331 financieros, 422 CPs geocodificados |
| R | Página /daily/[fecha] pública | Alta | ✅ | Sin login, diseño War Room |
| E | Matchear ~5 empresas Pipedrive | Media | ⏳ | Sercoin, Protech-PCI, Segufoc, IFI, Gesticon |
| H | Poblar BormePersona en cron | Media | ⏳ | Schema listo, falta lógica inserción |
| I | Web enrichment | Media | ⏳ | Logos, LinkedIn empresas en funnel — bloqueado por SSL scraping |
| — | Geocoding resto BD por CP | Media | ⏳ | Reverse Nominatim (lat/lng → postcode) — pausado hasta que webs vuelvan |
| — | **Investigar 500 en endpoints cron Vercel** | Alta | ⏳ | Ver sección 15 |

### Detalle tareas pendientes

**H — Poblar BormePersona en el cron**
- Actualmente `processBormeDate()` NO crea registros BormePersona (solo guarda `personaDetectada` en BormeAlerta)
- La tabla y el schema ya existen, solo falta la lógica de inserción
- Requiere backfill sobre alertas existentes

**E — Matchear empresas Pipedrive sin CRM**
- Pendientes: Sercoin, Protech-PCI, Segufoc, IFI, Gesticon, ~5 más
- Ajustar nombres en Pipedrive o usar CIFs para upsert directo

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

# Reclasificaciones (ya ejecutadas, no repetir salvo nuevo backfill)
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/reclasificar-ceses.ts
npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/reclasificar-posible-adquisicion.ts

# Build
npx next build
npx next lint
```

---

## 15. Notas técnicas críticas

- **force-dynamic**: todas las rutas API de datos deben tener `export const dynamic = "force-dynamic"`. Sin esto, Vercel puede cachear las respuestas.
- **Cron schedule (vercel.json)**: Pipedrive + BORME a las 20:00 UTC (22:00 CEST) L-V. Email a las 06:00 UTC (08:00 CEST) Ma-Sa.
- **BORME cron procesa HOY**: desde el 01/04/2026 el cron usa la fecha del día en curso. A las 22:00 CEST el BORME del día ya está publicado y completo.
- **500 en endpoints cron vía HTTP**: `/api/cron/borme` y `/api/cron/pipedrive` devuelven 500 cuando se llaman directamente con curl. Causa desconocida (pendiente revisar logs en Vercel → Functions). Workaround: scripts locales.
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
