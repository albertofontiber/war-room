# Fontiber War Room — Instrucciones para Claude

Documento de contexto para continuar el desarrollo entre conversaciones.
Actualizado: 2026-03-29

---

## 1. Qué es este proyecto

**War Room** es un dashboard interno de M&A para Fontiber, orientado al sector de PCI (protección contra incendios) y seguridad electrónica en España.

- Universo actual: **4.357 empresas** importadas de Excel
- Stack: Next.js 14 App Router · TypeScript · Prisma · PostgreSQL (Supabase) · Zustand · react-map-gl / Mapbox GL JS · Tailwind CSS
- Tema visual: oscuro, estilo "war room"
- Auth: NextAuth (credentials — alberto/gabriel)
- Deploy: Vercel

---

## 2. Estructura de archivos clave

```
src/
  app/
    page.tsx                        # Dashboard principal
    api/
      empresas/route.ts             # GET — GeoJSON de todas las empresas
      empresas/[id]/route.ts        # GET — detalle de empresa
      empresas/[id]/perimetro/      # PATCH — toggle enPerimetro
      cron/borme/route.ts           # GET — cron diario BORME (L-V 11:00 UTC)
      cron/pipedrive/route.ts       # GET — cron diario Pipedrive (L-V 10:00 UTC)
  components/
    MapaEspana.tsx                  # Mapa Mapbox con clusters y marcadores
    Sidebar.tsx                     # Filtros + estadísticas + lista BORME recientes
    TablaEmpresas.tsx               # Tabla con sorting y filtro por vista mapa
    PanelEmpresa.tsx                # Panel lateral detalle empresa
  lib/
    borme.ts                        # Lógica BORME ⭐
    filtros.ts                      # isInFilter()
    prisma.ts                       # Singleton PrismaClient
  store/
    useWarRoomStore.ts              # Zustand store central
  types/index.ts                    # Tipos + FILTROS_DEFAULT

prisma/schema.prisma                # Modelos BD

scripts/
  borme-backfill.ts                 # Backfill 6 meses (EJECUTADO 29/03/2026 — 1.223 alertas)
  borme-test.ts                     # Test diario read-only
  borme-buscar-empresa.ts           # Buscar empresa en historial BORME
  borme-crossref.ts                 # Cross-referencing de personas en BORME
  pipedrive-sync.ts                 # Sync Pipedrive → CrmEstado (idempotente)
  find-empresa.ts                   # Buscar empresa en DB por nombre

vercel.json                         # Crons: Pipedrive 10:00 UTC + BORME 11:00 UTC L-V
```

---

## 3. Funcionalidades completadas ✅

- Mapa Mapbox con 4.357 empresas, clusters, marcadores por sector/prioridad
- Marcadores de empresas filtradas (fondo) clickables con opacidad reducida
- Panel lateral de empresa: financieros, gráfico histórico, CRM, actividades, alertas BORME
- Filtros completos: CCAA + Provincia (cascada), Sector, Perímetro, Cepreven, Aerme, Grupo, Stage CRM, range sliders duales (Ingresos, Margen Bruto %, EBITDA %)
- Contador "En selección" en estadísticas del sidebar
- Vista tabla con sorting y toggle "Vista del mapa" (filtra por bounding box actual)
- Persistencia de viewport del mapa al cambiar entre vistas
- BORME: backfill 6 meses completado (1.223 alertas), cron diario configurado
- BORME: lista "Alertas BORME recientes" en sidebar con puntos pulsantes
- **Pipedrive sync: 148 empresas sincronizadas con dealStage y owner** ✅

---

## 4. Integración BORME ✅ COMPLETADA

### Estado

Backfill ejecutado el 29/03/2026. 1.223 alertas en DB (130 días hábiles, 3.938 PDFs).
Cron diario activo en `vercel.json`: L-V 11:00 UTC → `/api/cron/borme`.

### Diseño (matching por nombre normalizado)

Los PDFs del BORME Sección A NO incluyen CIF — solo nombre + Hoja del Registro.
Matching en dos niveles: nombre normalizado exacto → core sin forma jurídica.
`normalizeNombre()` en `src/lib/borme.ts`: mayúsculas, sin diacríticos, formas jurídicas unificadas.

### Señal clave: cross-referencing de personas

Los nombramientos de apoderados/administradores en `tipoActo: "otros"` son la señal M&A más potente.
Cuando la misma persona aparece en ≥2 empresas en pocos días = rollup en curso.

**Caso validado**: Luciano Villén Marta nombrado en 5 empresas en 5 días (FIRE BUSINESS + AEROEXTINCION + OASYS PCI + AIR FEU + FIRE BUSINESS BALEARES).

Script disponible:
```bash
npx tsx scripts/borme-crossref.ts "VILLEN MARTA" 5
```

**Pendiente**:
- Script sistemático que extraiga personas de TODOS los actos y genere grafo de empresas conectadas
- Añadir `tipoActo: "nombramiento"` separado de `"otros"`
- Vista dashboard de grupos inferidos por BORME

---

## 5. Integración Pipedrive ✅ COMPLETADA

### Estado (29/03/2026)

**148 empresas** sincronizadas con CRM. Cron diario: L-V 10:00 UTC → `/api/cron/pipedrive`.

Distribución actual:
- `contactado`: 96
- `identificado`: 39
- `LOI enviada`: 5
- `execution`: 2
- `muerto`: 6
- `portfolio`: 0

### Pipeline: Dealflow (id=1) — único pipeline sincronizado

El pipeline "Fundraising" (id=2) es para captación de capital propio de Fontiber — NO se sincroniza.

### Mapa de stages Pipedrive → War Room

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

### Matching: tres niveles

1. **pipedriveOrgId** (clave primaria) — para empresas ya mapeadas en CrmEstado
2. **nombre normalizado exacto** — misma lógica que BORME
3. **core sin forma jurídica** — fallback

Las ~100 entradas de Pipedrive que no matchean son inversores/FOs (Gramona FO, Miura Fund IV, etc.) que correctamente no están en nuestra DB de empresas PCI.

### Archivos

- `scripts/pipedrive-sync.ts` — sync completo idempotente. Ejecutar: `npx tsx scripts/pipedrive-sync.ts`
- `src/app/api/cron/pipedrive/route.ts` — endpoint cron diario
- `PIPEDRIVE_API_KEY` en `.env.local` y en Vercel env vars

### Notas técnicas

- `deal.org_id.value` = ID numérico de la org en Pipedrive (para link `https://fontiber.pipedrive.com/organization/{id}`)
- `deal.user_id.name` = owner del deal
- El link a Pipedrive en PanelEmpresa usa `pipedriveOrgId` → org page (no deal page)

---

## 6. Modelo de datos CRM

```prisma
model CrmEstado {
  id             Int      @id @default(autoincrement())
  empresaId      Int      @unique
  pipedriveOrgId String?  // ID numérico de la org en Pipedrive
  dealStage      String?  // "identificado"|"contactado"|"LOI enviada"|"execution"|"muerto"|"portfolio"
  owner          String?  // Nombre del responsable del deal
  updatedAt      DateTime @updatedAt
}
```

---

## 7. Modelo BormeAlerta

```prisma
model BormeAlerta {
  id          Int      @id @default(autoincrement())
  empresaId   Int
  fecha       DateTime
  tipoActo    String   // "adquisicion"|"disolucion"|"cambio_titular"|"fusion"|"otros"
  descripcion String?  // "NNNNNN — texto acto"
  urlBorme    String?
  leido       Boolean  @default(false)
  createdAt   DateTime @default(now())
}
```

---

## 8. Roadmap

### Alta prioridad — próximos pasos
- [ ] **Deploy + vars en Vercel**: añadir `CRON_SECRET` y `PIPEDRIVE_API_KEY` → desplegar → verificar crons
- [ ] **Cross-referencing sistemático de personas BORME**:
  - Script que recorra todos los `BormeAlerta.descripcion`, extraiga nombres de personas
  - Cruce: personas en ≥2 empresas de la DB = señal de grupo común
  - Vista en dashboard de grupos inferidos (distinto de grupos declarados)
  - Añadir `tipoActo: "nombramiento"` en el clasificador

### Media prioridad
- [ ] **Mejoras UX alertas BORME**: limpiar texto crudo, color diferenciado por tipo (fusión=rojo, nombramiento=ámbar)
- [ ] **Web enrichment** — logos, descripciones, LinkedIn URLs
- [ ] **Sector assignment** — todas son "PCI" ahora; añadir seguridad_electronica/mixto
- [ ] **Import Excel 2** — seguridad electrónica cuando esté disponible

### Baja prioridad
- [ ] **Exportar a Excel** desde la tabla
- [ ] **Grupos empresariales** — visualización del árbol de grupo
- [ ] **Modo presentación** — ya existe el toggle, refinar

---

## 9. Variables de entorno

```env
# .env.local
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
NEXT_PUBLIC_MAPBOX_TOKEN=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
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
npx tsx scripts/borme-backfill.ts                       # Backfill 6 meses (idempotente)
npx tsx scripts/borme-crossref.ts "APELLIDO" [dias]     # Cross-ref persona en BORME
npx tsx scripts/pipedrive-sync.ts                       # Sync Pipedrive → DB (idempotente)
npx next build                                          # Build producción
```

---

## 11. Notas técnicas críticas

- **pdf-parse v2**: `new PDFParse({ data: buffer }).getText()` — NO es `pdfParse(buffer)` de v1
- **Scripts excluidos del tsconfig**: `"exclude": ["scripts"]` — necesario para evitar errores de compilación en Next.js
- **FILTROS_DEFAULT**: `enPerimetro: null`, `ingresosMax: Infinity`, `margenBrutoMax: 100`
- **Matching BORME/Pipedrive**: dos Maps en RAM — `nombreToId` (exacto) y `coreToId` (sin forma jurídica)
- **Pipedrive matching primario**: `pipedriveOrgId` en CrmEstado → permite re-sync aunque el nombre cambie
- **Cron Vercel**: el endpoint debe tener `export const dynamic = "force-dynamic"` y `export const maxDuration = 300`
- **DealStage values**: `"identificado"|"contactado"|"LOI enviada"|"execution"|"muerto"|"portfolio"` — NO usar los antiguos `prospecto`, `NBO`, `exclusividad`
