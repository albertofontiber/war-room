# Fontiber War Room — Instrucciones para Claude

Documento de contexto para continuar el desarrollo entre conversaciones.
Actualizado: 2026-04-01 (sesión 5)

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
    page.tsx                              # Dashboard principal
    api/
      empresas/route.ts                   # GET — GeoJSON de todas las empresas (con jitter coords)
      empresas/[id]/route.ts              # GET — detalle de empresa
      empresas/[id]/perimetro/            # PATCH — toggle enPerimetro
      empresas/[id]/grupo/                # PATCH — asigna/crea grupo
      grupos/route.ts                     # GET — lista todos los grupos (autocomplete)
      borme/
        operaciones/route.ts              # GET — señales M&A enriquecidas (efectiveTipo + dedup)
        personas-compartidas/route.ts     # GET — personas en 2+ empresas (posibles nuevos grupos)
        recientes/route.ts                # GET — todos los actos BORME últimos 90 días (actividad)
      cron/
        borme/route.ts                    # GET — cron diario BORME (L-V 11:00 UTC)
        pipedrive/route.ts                # GET — cron diario Pipedrive (L-V 10:00 UTC)
        daily-summary/route.ts            # GET — cron resumen diario email (L-V 12:00 UTC)
  components/
    WarRoomLayout.tsx                     # Layout raíz — renderiza Mapa | Tabla | Operaciones
    MapaEspana.tsx                        # Mapa Mapbox con clusters, marcadores, selección área
    Navbar.tsx                            # Barra superior — toggle Mapa/Tabla/Operaciones + búsqueda
    Sidebar.tsx                           # Filtros + estadísticas (8 stages CRM)
    TablaEmpresas.tsx                     # Tabla con sorting, columna CIF y export Excel
    PanelEmpresa.tsx                      # Panel lateral detalle empresa
    OperacionesBorme.tsx                  # Vista Operaciones M&A (señales + alertas personas + actividad)
  lib/
    borme.ts                              # Lógica BORME: fetch, parse, classify, process ⭐
    borme-senales.ts                      # Catálogo señales por grupo (personas + keywords) ⭐
    email-daily-summary.ts                # Genera y envía resumen diario por email (Resend)
    filtros.ts                            # isInFilter()
    prisma.ts                             # Singleton PrismaClient
  store/
    useWarRoomStore.ts                    # Zustand store central (Vista: "mapa"|"tabla"|"operaciones")
  types/index.ts                          # Tipos + FILTROS_DEFAULT + DealStage (8 valores)

prisma/schema.prisma                      # Modelos BD

scripts/
  borme-backfill.ts                       # Backfill 6 meses (EJECUTADO 29/03/2026 — 1.223 alertas)
  borme-backfill-grupos.ts                # Re-clasifica alertas + asigna grupos (EJECUTADO 30/03/2026)
  borme-test.ts                           # Test diario read-only
  borme-buscar-empresa.ts                 # Buscar empresa en historial BORME
  pipedrive-sync.ts                       # Sync Pipedrive → CrmEstado (idempotente) — 155 matches
  import-grupos-perimetro.ts              # Importa grupos y perímetro desde Excel (29/03/2026)
  import-seg-electronica.ts              # Importa empresas seg. electrónica (29/03/2026 — 666 nuevas)
  find-empresa.ts                         # Buscar empresa en DB por nombre

vercel.json                               # Crons: Pipedrive 10:00 + BORME 11:00 + Email 12:00 UTC L-V
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
- **BORME**: cross-referencing M&A completado (ver sección 4)
- **Dashboard Operaciones M&A** completado con 3 sub-tabs (ver sección 5)
- **Pipedrive sync**: 155 empresas sincronizadas con dealStage y owner ✅
- **CRM ampliado a 8 etapas**: identificado / contactado / 1ª reunión / análisis / LOI enviada / ejecución / portfolio / muerto ✅
- **Deploy en producción**: https://warroom.fontiber.com ✅
- **Grupos actualizados**: Grupo Fire (23), Plana Fabrega (12), Eurofesa (5), Scutum, Attlon ✅
- **Perímetro actualizado**: 1.552 in / 2.805 out (desde Excel 29/03/2026) ✅
- **Toggle perímetro** en PanelEmpresa persiste en BD vía `PATCH /api/empresas/[id]/perimetro` ✅
- **Seguridad electrónica importada**: 666 nuevas + 399 mixtas, total 5.017 empresas ✅
- **Grupos editables desde panel**: sección GESTIÓN (ámbar) con autocomplete + "Crear nuevo" ✅
- **Clusters como donut pie chart**: proporciones de etapas CRM visibles en cada cluster ✅
- **Filtro de opacidad en mapa**: empresas excluidas por filtro aparecen en gris/tenue ✅
- **Resumen diario por email**: cron L-V 12:00 UTC → alberto@fontiber.com (Resend) ✅
- **Exportar tabla a Excel**: botón en toolbar de la vista Tabla ✅

---

## 4. Integración BORME ✅ COMPLETADA

### Estado

- Backfill ejecutado el 29/03/2026: **1.223 alertas** (130 días hábiles, 3.938 PDFs)
- Cron diario activo en `vercel.json`: L-V 11:00 UTC → `/api/cron/borme`
- Re-clasificación M&A ejecutada el 30/03/2026: **93 señales operacionales** detectadas

### Clasificación de actos (`tipoActo`)

```
fusion              — Fusión / absorción / escisión
adquisicion         — Socio único / unipersonalidad / cesión de participaciones
cambio_denominacion — Cambio de denominación (rebranding post-adquisición)
nombramiento_grupo  — Nombramiento con persona conocida de un grupo identificado
nombramiento        — Nombramiento sin señal de grupo conocido
disolucion          — Disolución / liquidación / extinción
otros               — Resto de actos
```

> **Nota**: `nombramiento_interno` fue eliminado en sesión 5. Todos los nombramientos en empresas ya mapeadas al grupo se clasifican simplemente como `nombramiento`.

### `efectiveTipo` (refinamiento en la vista Operaciones)

El campo `efectiveTipo` se calcula en el API de operaciones a partir de `tipoActo` + estado real de la empresa:

```
posible_adquisicion  — nombramiento_grupo en empresa NO mapeada al grupo → señal fuerte ⭐
                       (persona clave de un grupo conocido detectada fuera de ese grupo)
nombramiento         — nombramiento genérico O nombramiento_grupo en empresa YA mapeada al grupo
(resto)              — igual que tipoActo
```

> **«Posible adq.»** se refiere exclusivamente a adquisiciones potenciales por parte de **grupos conocidos** catalogados en `borme-senales.ts` (Grupo Fire, Eurofesa, Scutum, Attlon, Plana Fàbrega). No debe confundirse con adquisiciones por agentes externos.

### Catálogo de señales por grupo (`src/lib/borme-senales.ts`)

Personas clave y keywords para cada grupo. `detectarGrupo(texto)` devuelve el grupo y motivo.

| Grupo | Personas clave |
|---|---|
| Grupo Fire | LUCIANO VILLEN MARTA, ZALA NAVARRO ALEJANDRO, REYES ROMERO LUIS ROBERTO, GUITARD MALDONADO ALVARO |
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

Vista accesible desde el botón **"Operaciones"** en la Navbar (junto a Mapa y Tabla).

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
  - Filtra false positives: rechaza candidatos con palabras de 1 carácter (A, Y) o keywords estructurales (SOLIDARIOS, MANCOMUNADOS, UNICO, ADMINISTRADORES…)
  - Agrupa por nombre normalizado → personas en 2+ empresas distintas
  - Excluye personas ya en GRUPOS_SENALES (conocidas)
  - Incluye datos financieros y geográficos de cada empresa
- **Tabla flat**: Persona | Empresa | Rol | Fecha | Ingresos | EBITDA | MB% | Grupo
  - Filas del mismo grupo de persona separadas por borde superior
- **Lógica de filtros**: cuando hay filtros activos, se muestra una persona si AL MENOS UNA de sus empresas pasa el filtro (se muestran TODAS sus empresas para conservar contexto cruzado)
- **Limitación conocida**: solo detecta nombres en patrones explícitos "Rol: NOMBRE". Para cobertura total se necesita poblar la tabla `BormePersona` en el cron (pendiente).

### Sub-tab "Actividad reciente" ✅ NUEVO (sesión 5)

- **API**: `GET /api/borme/recientes`
  - Devuelve todos los `BormeAlerta` de los últimos 90 días (todos los tipos, no solo M&A)
  - Enriquecidos con empresa (nombre, CIF, financieros, grupo, perímetro)
  - `export const dynamic = "force-dynamic"`
- **Tabla**: Fecha | Tipo (pill coloreado) | Empresa | Provincia | Grupo | Ingresos | BORME↗
- **Stats bar**: contadores por `tipoActo` (fusión, adquisición, rebranding, nombramiento_grupo, nombramiento, disolución, otros)
- Lazy fetch: solo se carga cuando el usuario entra en este sub-tab

---

## 6. Integración Pipedrive ✅ COMPLETADA

### Estado (01/04/2026)

**155 empresas** sincronizadas. Cron diario: L-V 10:00 UTC → `/api/cron/pipedrive`.

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

**Fix parentéticos** (sesión 5): antes de normalizar el nombre de Pipedrive se eliminan los alias entre paréntesis. Ejemplo: `"PROTECCION Y DETECCION DE INCENDIOS SL (Prodein)"` → `"PROTECCION Y DETECCION DE INCENDIOS SL"`. Esto se aplica en el cron y en el script de sync.

---

## 7. Mapa — detalles técnicos

### Fuentes y capas

El mapa usa **dos fuentes GeoJSON** calculadas client-side en `MapaEspana.tsx`:

| Fuente | Contenido | Cluster | Capas |
|---|---|---|---|
| `empresas` | Empresas que **pasan** los filtros activos | Sí (maxZoom 10) | `clusters` (click), `borme-ring`, `markers-pci`, `markers-segelec`, `markers-mixto` |
| `empresas-bg` | Empresas que **NO pasan** los filtros | No | `markers-bg` (gris, 0.35 opacity) |

La propiedad `enFiltro` **no se usa** actualmente — la separación en dos fuentes hace las veces de filtro de visibilidad. Los filtros `["boolean", ["get", "enFiltro"], true]` en las capas activas son seguros (devuelven `true` por fallback cuando la propiedad no existe) pero son efectivamente un no-op dado que la fuente `empresas` ya solo contiene features que pasan el filtro.

### Marcadores por sector

| Sector | Forma | Capa |
|---|---|---|
| PCI | Círculo | `markers-pci` (circle layer) |
| Seguridad electrónica | Cuadrado redondeado | `markers-segelec` (symbol, icono SDF) |
| Mixto | Hexágono | `markers-mixto` (symbol, icono SDF) |

Los iconos SDF (`shape-square`, `shape-hexagon`) se añaden al estilo en `handleMapLoad`. Color = `CRM_COLOR` (expresión Mapbox por `dealStage`).

### Clusters como donut pie chart (sesión 5)

Los clusters ya no son círculos de color sólido. Se usan `Marker` de react-map-gl con un SVG personalizado (`ClusterPie`) que muestra la distribución proporcional de etapas CRM.

- `clusterProperties` agrega contadores por stage: `s_id`, `s_ct`, `s_pr`, `s_an`, `s_lo`, `s_ex`, `s_po`, `s_mu`
- La capa `clusters` es transparente (solo para detección de clicks)
- `updateClusterMarkers` consulta `querySourceFeatures("empresas")` en cada `onIdle` y actualiza los `Marker` React

### Fix reuseMaps + iconsReady (sesión 5)

Con `reuseMaps` activo, el evento `onLoad` **no se dispara** al remontar el componente (cambio de pestaña Tabla→Mapa). Esto dejaba `iconsReady = false` y los marcadores de segelec y mixto desaparecían.

**Fix**: `handleIdle` (conectado a `onIdle`) comprueba con `map.hasImage()` si los iconos siguen en el estilo, los re-añade si faltan, y llama `setIconsReady(true)`. El guard `hasImage` evita duplicados.

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

## 8. CRM — Etapas (8 stages)

Ampliado en sesión 5. `primera_reunion` y `analisis` son ahora etapas independientes (antes colapsadas en `contactado`).

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

Usado en: `types/index.ts` (`DealStage`), `CrmEstado.dealStage` (BD), `TablaEmpresas.tsx`, `PanelEmpresa.tsx`, `Sidebar.tsx`, `MapaEspana.tsx` (CRM_COLOR + clusterProperties), `email-daily-summary.ts`.

---

## 9. Email resumen diario ✅ NUEVO (sesión 5)

- **Cron**: L-V 12:00 UTC → `GET /api/cron/daily-summary`
- **Librería**: Resend (`npm install resend`) — init **dentro** de la función (no a nivel módulo, evita error de build en Vercel)
- **Destinatario**: alberto@fontiber.com
- **Contenido**: señales BORME del día, cambios Pipedrive, cambios de perímetro, alertas de personas
- **Variable de entorno requerida**: `RESEND_API_KEY` (añadir en Vercel → Settings → Environment Variables)

```typescript
// CORRECTO — init dentro de la función
export async function sendDailySummary() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);  // ← DENTRO de la función
  ...
}
```

---

## 10. Modelos de datos relevantes (Prisma)

### BormeAlerta

```prisma
model BormeAlerta {
  id               Int            @id @default(autoincrement())
  empresaId        Int
  empresa          Empresa        @relation(fields: [empresaId], references: [id])
  fecha            DateTime
  tipoActo         String         // "fusion"|"adquisicion"|"cambio_denominacion"|"nombramiento_grupo"|"nombramiento"|"disolucion"|"otros"
  descripcion      String?        // "NNNNNN — texto acto"
  urlBorme         String?
  leido            Boolean        @default(false)
  grupoInferidoId  Int?           // Grupo detectado por señales conocidas
  grupoInferido    Grupo?         @relation(fields: [grupoInferidoId], references: [id])
  personaDetectada String?        // Nombre normalizado de la persona clave detectada
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
  nombreNorm  String      // MAYUSCULAS sin diacríticos
  rol         String?     // "apoderado"|"administrador"|"consejero"|etc.
  fecha       DateTime
  createdAt   DateTime    @default(now())
  @@index([nombreNorm])
  @@index([empresaId])
  @@index([alertaId])
}
```

### CrmEstado

```prisma
model CrmEstado {
  id             Int      @id @default(autoincrement())
  empresaId      Int      @unique
  pipedriveOrgId String?
  dealStage      String?  // ver sección 8 — 8 valores posibles
  owner          String?
  updatedAt      DateTime @updatedAt
}
```

---

## 11. Roadmap

### Estado sesión 01/04/2026

| # | Tarea | Prioridad | Estado | Notas |
|---|---|---|---|---|
| A | Importar seg. electrónica | Alta | ✅ Completado | 666 nuevas + 399 mixtas |
| B | Actualizar grupos desde Excel | Alta | ✅ Completado | 5 grupos (Fire 23, Plana 12, Eurofesa 5, Scutum, Attlon) |
| C | Actualizar perímetro desde Excel | Alta | ✅ Completado | 1.552 in / 2.805 out |
| D | Editar grupo desde panel lateral | Alta | ✅ Completado | Sección GESTIÓN + autocomplete |
| F | Cross-referencing BORME (personas) | Alta | ✅ Completado | Catálogo señales + backfill + dashboard Operaciones |
| G | Dashboard Operaciones M&A | Alta | ✅ Completado | 3 sub-tabs: señales + alertas personas + actividad reciente |
| K | Exportar tabla a Excel | Media | ✅ Completado | Botón en toolbar de vista Tabla |
| N | CRM 8 etapas | Alta | ✅ Completado | primera_reunion + analisis como stages independientes |
| O | Resumen diario email | Media | ✅ Completado | Resend, L-V 12:00 UTC → alberto@fontiber.com (pendiente añadir RESEND_API_KEY en Vercel) |
| E | Matchear ~10 empresas Pipedrive | Media | ⏳ Pendiente | Sercoin, Protech-PCI, Segufoc, IFI, Gesticon… (PRODEIN ya matcheado) |
| H | Poblar BormePersona en cron | Media | ⏳ Pendiente | Para cobertura total de alertas personas |
| I | Web enrichment | Media | ⏳ Pendiente | Logos, descripciones, LinkedIn de empresas en funnel |
| J | Dashboard Operaciones — Opción B | Baja | ⏳ Pendiente | Integrar señales BORME en PanelEmpresa |
| L | Visualización árbol de grupos | Baja | ⏳ Pendiente | — |
| M | Nombramientos como señal de adquisición | Baja | ⏳ Pendiente | Ver detalle abajo |

### Detalle tareas pendientes

**H — Poblar BormePersona en el cron**
- Actualmente `processBormeDate()` NO crea registros BormePersona (solo guarda `personaDetectada` en BormeAlerta)
- Para cobertura total: añadir extracción de personas en `borme.ts` y crear registros BormePersona
- Requiere backfill sobre alertas existentes con `extractPersonasFromDesc()`
- La tabla y el schema ya existen, solo falta la lógica de inserción

**M — Nombramientos como señal de adquisición (consolidadores no catalogados)**
- Actualmente los `nombramiento` tienen fuerza de señal insuficiente para inferir adquisición
- La señal se vuelve relevante combinada con enriquecimiento externo:
  - **Scraping web / LinkedIn**: verificar si el nuevo administrador tiene historial en empresas del sector PCI
  - **Prensa económica**: buscar noticias de adquisición asociadas al nombre o empresa
  - **Repetición geográfica**: misma persona nombrada en varias empresas de la misma provincia en poco tiempo (ya parcialmente cubierto por "Alertas personas")
- Next step concreto: cuando `alertas_personas` detecte una persona en 3+ empresas, clasificarla automáticamente como "posible consolidador emergente" y añadirla al catálogo `GRUPOS_SENALES` para seguimiento

**E — Matchear empresas Pipedrive sin CRM**
- PRODEIN ya matcheado (sesión 5: fix para nombres con alias entre paréntesis)
- Pendientes: Sercoin, Protech-PCI, Segufoc, IFI, Gesticon, y otras ~5
- Requiere CIFs para hacer upsert directo, o ajustar nombres en Pipedrive

---

## 12. Variables de entorno

```env
# .env.local
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
NEXT_PUBLIC_MAPBOX_TOKEN=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000   # Producción: https://warroom.fontiber.com
ADMIN_USER_1=alberto
ADMIN_PASS_1=warroom2024
ADMIN_USER_2=gabriel
ADMIN_PASS_2=warroom2024
PIPEDRIVE_API_KEY=5dabb677eed66876bfbab960f678f98ca4e91b43

# Solo Vercel (producción)
CRON_SECRET=<string_aleatorio>
RESEND_API_KEY=<clave_resend>        # ⚠️ PENDIENTE DE AÑADIR en Vercel Settings
```

---

## 13. Comandos útiles

```bash
npm run dev                                              # Desarrollo
npx tsx scripts/find-empresa.ts "nombre"                # Buscar empresa en DB
npx tsx scripts/borme-test.ts                           # Test BORME hoy (read-only)
npx tsx scripts/borme-buscar-empresa.ts "NOMBRE" 6      # Buscar empresa en BORME historial
npx tsx scripts/borme-backfill.ts                       # Backfill BORME 6 meses (idempotente)
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' \
  scripts/borme-backfill-grupos.ts                      # Re-clasificar alertas + asignar grupos
npx tsx scripts/pipedrive-sync.ts                       # Sync Pipedrive → DB (idempotente)
npx tsx scripts/import-grupos-perimetro.ts              # Re-importar grupos y perímetro desde Excel
npx tsx scripts/import-seg-electronica.ts               # Re-importar empresas seg. electrónica
npx next build                                          # Build producción (tsc + eslint + next)
```

---

## 14. Notas técnicas críticas

- **Vercel build**: trata los errores ESLint como errores de compilación. Verificar siempre con `npx next lint` antes de hacer push. El warning preexistente de `react-hooks/exhaustive-deps` en MapaEspana.tsx no bloquea el build.
- **Vista type**: `"mapa" | "tabla" | "operaciones"` en `src/types/index.ts`. El store usa `setVista()`.
- **efectiveTipo**: campo calculado en `/api/borme/operaciones` (no en BD). `posible_adquisicion` = nombramiento de persona clave de un **grupo conocido** (GRUPOS_SENALES) en empresa NO ya mapeada a ese grupo. Los `nombramiento_grupo` en empresa ya mapeada se tratan simplemente como `nombramiento`. El tipo `nombramiento_interno` fue eliminado.
- **DealStage values (8)**: `"identificado"|"contactado"|"primera_reunion"|"analisis"|"LOI enviada"|"execution"|"portfolio"|"muerto"` — NO usar los antiguos `prospecto`, `NBO`, `exclusividad`, ni `contactado` para referirse a primera reunión o análisis.
- **Jitter coordenadas**: `getJitter(cif, axis)` en `empresas/route.ts` — hash deterministico por CIF, ±0.0004° (~44m). Mismo CIF siempre da el mismo offset.
- **Filtros personas tab**: cuando hay filtros activos, una persona se incluye si ≥1 de sus empresas pasa el filtro. Se muestran TODAS sus empresas (no solo las que pasan) para conservar contexto cruzado.
- **pdf-parse v2**: `new PDFParse({ data: buffer }).getText()` — NO es `pdfParse(buffer)` de v1.
- **Scripts excluidos del tsconfig**: `"exclude": ["scripts"]` — necesario para evitar errores de compilación Next.js.
- **FILTROS_DEFAULT**: `enPerimetro: null`, `ingresosMax: Infinity`, `margenBrutoMax: 100`.
- **Matching BORME/Pipedrive**: dos Maps en RAM — `nombreToId` (exacto) y `coreToId` (sin forma jurídica). Los alias entre paréntesis en nombres de Pipedrive se eliminan ANTES de normalizar: `orgName.replace(/\s*\(.*?\)\s*/g, " ").trim()`.
- **Cron Vercel**: endpoints deben tener `export const dynamic = "force-dynamic"` y `export const maxDuration = 300`.
- **Resend init**: `new Resend(apiKey)` debe estar DENTRO de la función (no a nivel módulo), de lo contrario falla el build de Vercel por `Missing API key`.
- **reuseMaps + iconsReady**: con `reuseMaps` activo en el componente `Map`, `onLoad` no se dispara al remontar. Los iconos SDF se re-añaden en `handleIdle` con guard `map.hasImage()`. Sin este fix, las capas `markers-segelec` y `markers-mixto` desaparecen al volver a la pestaña Mapa.
- **norm() exportada**: `src/lib/borme-senales.ts` exporta `norm()` para uso en otros módulos.
