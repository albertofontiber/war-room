# Fontiber War Room — Instrucciones para Claude

Documento de contexto para continuar el desarrollo entre conversaciones.
Actualizado: 2026-03-30 (sesión 4)

---

## 1. Qué es este proyecto

**War Room** es un dashboard interno de M&A para Fontiber, orientado al sector de PCI (protección contra incendios) y seguridad electrónica en España.

- Universo actual: **5.023 empresas** (4.357 PCI + 666 seg. electrónica)
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
      cron/
        borme/route.ts                    # GET — cron diario BORME (L-V 11:00 UTC)
        pipedrive/route.ts                # GET — cron diario Pipedrive (L-V 10:00 UTC)
  components/
    WarRoomLayout.tsx                     # Layout raíz — renderiza Mapa | Tabla | Operaciones
    MapaEspana.tsx                        # Mapa Mapbox con clusters, marcadores, selección área
    Navbar.tsx                            # Barra superior — toggle Mapa/Tabla/Operaciones
    Sidebar.tsx                           # Filtros + estadísticas + lista BORME recientes
    TablaEmpresas.tsx                     # Tabla con sorting y toggle "Vista del mapa"
    PanelEmpresa.tsx                      # Panel lateral detalle empresa
    OperacionesBorme.tsx                  # Vista Operaciones M&A (señales + alertas personas)
  lib/
    borme.ts                              # Lógica BORME: fetch, parse, classify, process ⭐
    borme-senales.ts                      # Catálogo señales por grupo (personas + keywords) ⭐
    filtros.ts                            # isInFilter()
    prisma.ts                             # Singleton PrismaClient
  store/
    useWarRoomStore.ts                    # Zustand store central (Vista: "mapa"|"tabla"|"operaciones")
  types/index.ts                          # Tipos + FILTROS_DEFAULT

prisma/schema.prisma                      # Modelos BD

scripts/
  borme-backfill.ts                       # Backfill 6 meses (EJECUTADO 29/03/2026 — 1.223 alertas)
  borme-backfill-grupos.ts                # Re-clasifica alertas + asigna grupos (EJECUTADO 30/03/2026)
  borme-test.ts                           # Test diario read-only
  borme-buscar-empresa.ts                 # Buscar empresa en historial BORME
  pipedrive-sync.ts                       # Sync Pipedrive → CrmEstado (idempotente)
  import-grupos-perimetro.ts              # Importa grupos y perímetro desde Excel (29/03/2026)
  import-seg-electronica.ts              # Importa empresas seg. electrónica (29/03/2026 — 666 nuevas)
  find-empresa.ts                         # Buscar empresa en DB por nombre

vercel.json                               # Crons: Pipedrive 10:00 UTC + BORME 11:00 UTC L-V
```

---

## 3. Funcionalidades completadas ✅

- Mapa Mapbox con 5.023 empresas, clusters, marcadores por sector/prioridad
- Jitter deterministico en coordenadas: offset ±44m por hash del CIF (evita solapamiento exacto)
- Panel lateral de empresa: financieros, gráfico histórico, CRM, actividades, alertas BORME, scroll nativo
- Filtros completos: CCAA + Provincia (cascada), Sector, Perímetro, Cepreven, Aerme, Grupo, Stage CRM, sliders duales (Ingresos, Margen Bruto %, EBITDA %)
  - Bug fix sesión 4: `minStepsBetweenValues={1}` (era `step` — causaba slider roto)
- Selección de área por polígono: doble-clic → dibuja polígono → tabla de empresas en área, sortable, con MB%/EBITDA%
  - Bug fix sesión 4: polígono usa datos filtrados (geojson), no rawGeoJSON
- Vista tabla con sorting y toggle "Vista del mapa"
- Mapa resize automático al abrir/cerrar panel lateral
- Persistencia de viewport del mapa al cambiar entre vistas
- **BORME**: backfill 6 meses completado (1.223 alertas), cron diario configurado
- **BORME**: cross-referencing M&A completado (ver sección 4)
- **BORME**: lista "Alertas BORME recientes" en sidebar con puntos pulsantes
- **Dashboard Operaciones M&A** completado (ver sección 5)
- **Pipedrive sync**: 148 empresas sincronizadas con dealStage y owner ✅
- **Deploy en producción**: https://warroom.fontiber.com ✅
- **Grupos actualizados**: Grupo Fire (23), Plana Fabrega (12), Eurofesa (5), Scutum, Attlon ✅
- **Perímetro actualizado**: 1.552 in / 2.805 out (desde Excel 29/03/2026) ✅
- **Toggle perímetro** en PanelEmpresa persiste en BD vía `PATCH /api/empresas/[id]/perimetro` ✅
- **Seguridad electrónica importada**: 666 nuevas + 399 mixtas, total 5.023 empresas ✅
- **Grupos editables desde panel**: sección GESTIÓN (ámbar) con autocomplete + "Crear nuevo" ✅

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

### `efectiveTipo` (refinamiento en la vista Operaciones)

El campo `efectiveTipo` se calcula en el API de operaciones a partir de `tipoActo` + estado real de la empresa:

```
posible_adquisicion  — nombramiento_grupo en empresa NO mapeada al grupo → señal fuerte ⭐
nombramiento_interno — nombramiento_grupo en empresa YA mapeada al grupo → rutina, se excluye
(resto)              — igual que tipoActo
```

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

### Grupo Fire — empresas mapeadas (23 total)

FIRE BUSINESS SL, AEROEXTINCION SL, OASYS PCI SL, AIR FEU SL, FIRE BUSINESS BALEARES SL, GALLEX FIRE SL, MASTER CENTELLA SL, INGESFOC INGENIEROS SL, EXTINFUEGO SL, NIOEXTIN SL, CISEMEX SL, RO SEGUR SL, EXTINTORES VIVO SL, EXTINTORES E INSTALACIONES CONTRAINCENDIOS ANIN SL, JOSMA FOC SL, NI FOC NI FUM SL, SEGURIDACOR SL, más algunas confirmadas post-backfill.

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
  - Calcula `efectiveTipo` (posible_adquisicion / nombramiento_interno)
  - Deduplicación por (empresaId, día): conserva el tipo de mayor prioridad
  - Excluye `nombramiento_interno` (empresa ya mapeada al grupo → sin interés operacional)
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

---

## 6. Integración Pipedrive ✅ COMPLETADA

### Estado (29/03/2026)

**148 empresas** sincronizadas. Cron diario: L-V 10:00 UTC → `/api/cron/pipedrive`.

| Stage Pipedrive | stage_id | War Room |
|---|---|---|
| Identificado | 6 | `identificado` |
| Contactado | 7 | `contactado` |
| 1a reunión realizada | 8 | `contactado` |
| Análisis | 9 | `contactado` |
| LOI enviada | 10 | `LOI enviada` |
| Execution | 11 | `execution` |
| Portfolio | 12 | `portfolio` |
| status=lost | — | `muerto` |

Pipeline sincronizado: **Dealflow (id=1)**. El pipeline "Fundraising" (id=2) es para captación de capital propio → NO se sincroniza.

Matching: pipedriveOrgId (primario) → nombre normalizado exacto → core sin forma jurídica.

---

## 7. Modelos de datos relevantes (Prisma)

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
  dealStage      String?  // "identificado"|"contactado"|"LOI enviada"|"execution"|"muerto"|"portfolio"
  owner          String?
  updatedAt      DateTime @updatedAt
}
```

---

## 8. Roadmap

### Estado sesión 30/03/2026

| # | Tarea | Prioridad | Estado | Notas |
|---|---|---|---|---|
| A | Importar seg. electrónica | Alta | ✅ Completado | 666 nuevas + 399 mixtas |
| B | Actualizar grupos desde Excel | Alta | ✅ Completado | 5 grupos (Fire 23, Plana 12, Eurofesa 5, Scutum, Attlon) |
| C | Actualizar perímetro desde Excel | Alta | ✅ Completado | 1.552 in / 2.805 out |
| D | Editar grupo desde panel lateral | Alta | ✅ Completado | Sección GESTIÓN + autocomplete |
| F | Cross-referencing BORME (personas) | Alta | ✅ Completado | Catálogo señales + backfill + dashboard Operaciones |
| G | Dashboard Operaciones M&A | Alta | ✅ Completado | Vista tabla + alertas personas |
| E | Matchear ~10 empresas Pipedrive | Media | ⏳ Pendiente | Sercoin, Protech-PCI, Segufoc, PRODEIN, IFI, Gesticon… |
| H | Poblar BormePersona en cron | Media | ⏳ Pendiente | Para cobertura total de alertas personas |
| I | Web enrichment | Media | ⏳ Pendiente | Logos, descripciones, LinkedIn de empresas en funnel |
| J | Dashboard Operaciones — Opción B | Baja | ⏳ Pendiente | Integrar señales BORME en PanelEmpresa |
| K | Exportar tabla a Excel | Baja | ⏳ Pendiente | — |
| L | Visualización árbol de grupos | Baja | ⏳ Pendiente | — |

### Detalle tareas pendientes

**H — Poblar BormePersona en el cron**
- Actualmente `processBormeDate()` NO crea registros BormePersona (solo guarda `personaDetectada` en BormeAlerta)
- Para cobertura total: añadir extracción de personas en `borme.ts` y crear registros BormePersona
- Requiere backfill sobre alertas existentes con `extractPersonasFromDesc()`
- La tabla y el schema ya existen, solo falta la lógica de inserción

**E — Matchear empresas Pipedrive sin CRM**
- Pendientes: Sercoin, Protech-PCI, Segufoc, PRODEIN, IFI, Gesticon, y otras ~10
- Requiere CIFs para hacer upsert directo

---

## 9. Variables de entorno

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
```

---

## 10. Comandos útiles

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

## 11. Notas técnicas críticas

- **Vercel build**: trata los errores ESLint como errores de compilación. Verificar siempre con `npx next lint` antes de hacer push. El warning preexistente de `react-hooks/exhaustive-deps` en MapaEspana.tsx no bloquea el build.
- **Vista type**: `"mapa" | "tabla" | "operaciones"` en `src/types/index.ts`. El store usa `setVista()`.
- **efectiveTipo**: campo calculado en `/api/borme/operaciones` (no en BD). `posible_adquisicion` = nombramiento de persona conocida en empresa NO ya mapeada al grupo.
- **Jitter coordenadas**: `getJitter(cif, axis)` en `empresas/route.ts` — hash deterministico por CIF, ±0.0004° (~44m). Mismo CIF siempre da el mismo offset.
- **Filtros personas tab**: cuando hay filtros activos, una persona se incluye si ≥1 de sus empresas pasa el filtro. Se muestran TODAS sus empresas (no solo las que pasan) para conservar contexto cruzado.
- **pdf-parse v2**: `new PDFParse({ data: buffer }).getText()` — NO es `pdfParse(buffer)` de v1
- **Scripts excluidos del tsconfig**: `"exclude": ["scripts"]` — necesario para evitar errores de compilación Next.js
- **FILTROS_DEFAULT**: `enPerimetro: null`, `ingresosMax: Infinity`, `margenBrutoMax: 100`
- **Matching BORME/Pipedrive**: dos Maps en RAM — `nombreToId` (exacto) y `coreToId` (sin forma jurídica)
- **Cron Vercel**: endpoints deben tener `export const dynamic = "force-dynamic"` y `export const maxDuration = 300`
- **DealStage values**: `"identificado"|"contactado"|"LOI enviada"|"execution"|"muerto"|"portfolio"` — NO usar los antiguos `prospecto`, `NBO`, `exclusividad`
- **norm() exportada**: `src/lib/borme-senales.ts` exporta `norm()` para uso en otros módulos
