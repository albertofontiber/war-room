/**
 * Schema y contexto de negocio para el chat IA.
 * Se incluye como system prompt para que Claude pueda generar queries SQL.
 */

export const DB_SCHEMA = `
## Base de datos: War Room (Fontiber Industrial Partners)

Dashboard de M&A para el sector PCI (protección contra incendios) y seguridad electrónica en España.
Universo: ~5.140 empresas.

### Tablas

-- Grupos empresariales (holdings, PE, multinacionales)
CREATE TABLE "Grupo" (
  id SERIAL PRIMARY KEY,
  nombre TEXT,           -- "Grupo Fire", "Plana Fàbrega", "Eurofesa", "Scutum", "Attlon"
  tipo TEXT,             -- "nacional"|"PE"|"familiar"|"multinacional"
  "paisOrigen" TEXT,
  notas TEXT
);

-- Empresas del universo PCI / seguridad electrónica
CREATE TABLE "Empresa" (
  id SERIAL PRIMARY KEY,
  cif TEXT UNIQUE,       -- NIF/CIF de la empresa
  nombre TEXT,
  direccion TEXT,
  "codigoPostal" TEXT,
  telefono TEXT,
  localidad TEXT,        -- municipio
  provincia TEXT,        -- provincia española
  ccaa TEXT,             -- comunidad autónoma
  lat FLOAT,
  lng FLOAT,
  sector TEXT,           -- "PCI" | "seguridad_electronica" | "mixto"
  servicios TEXT,        -- JSON array de servicios
  "grupoId" INT REFERENCES "Grupo"(id),
  empleados INT,
  web TEXT,
  linkedin TEXT,
  descripcion TEXT,
  cepreven TEXT,  -- NULL = no asociada, 'asociada' = miembro CEPREVEN, 'calificada' = certificada por CEPREVEN
  aerme BOOLEAN DEFAULT false,     -- asociada a AERME
  "ambitoGeo" TEXT,      -- "E" = estatal | "A" = autonómico (solo seg. electrónica)
  "enPerimetro" BOOLEAN DEFAULT true,  -- true = empresa de interés para M&A
  "anioConstitucion" INT,
  "esAnonima" BOOLEAN DEFAULT false,   -- true = "lead anónimo" del Pipeline (identidad confidencial; CIF pattern "LEAD-{id}"). Filtrados fuera del mapa, tabla, BORME y stats.
  fuente TEXT DEFAULT 'excel_seed'  -- origen del dato
);

-- Datos financieros anuales (ingresos, márgenes, EBITDA en euros)
CREATE TABLE "Financiero" (
  id SERIAL PRIMARY KEY,
  "empresaId" INT REFERENCES "Empresa"(id),
  anio INT,              -- año del dato financiero
  ingresos FLOAT,        -- ingresos en euros
  "margenBruto" FLOAT,   -- GM (gross margin) en euros (para %, dividir entre ingresos * 100). En las respuestas al usuario, llamarlo "GM" siempre.
  ebitda FLOAT,          -- EBITDA en euros (para %, dividir entre ingresos * 100)
  "resultadoNeto" FLOAT, -- resultado neto en euros
  UNIQUE("empresaId", anio)
);

-- Alertas del BORME (Boletín Oficial del Registro Mercantil)
CREATE TABLE "BormeAlerta" (
  id SERIAL PRIMARY KEY,
  "empresaId" INT REFERENCES "Empresa"(id),
  fecha TIMESTAMP,
  "tipoActo" TEXT,       -- "fusion"|"adquisicion"|"cambio_denominacion"|"nombramiento_grupo"|"nombramiento"|"otros"
  descripcion TEXT,      -- texto del acto mercantil
  "urlBorme" TEXT,
  leido BOOLEAN DEFAULT false,
  "grupoInferidoId" INT REFERENCES "Grupo"(id),
  "personaDetectada" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Personas con cargo vigente en empresas (de empresia.es y BORME)
CREATE TABLE "PersonaCargo" (
  id SERIAL PRIMARY KEY,
  "empresaId" INT REFERENCES "Empresa"(id),
  "nombreNorm" TEXT,     -- nombre normalizado (clave de agrupación)
  "nombreOrig" TEXT,     -- nombre original legible
  rol TEXT,              -- "administrador_unico"|"consejero_delegado"|"presidente"|etc.
  "fechaDesde" TIMESTAMP,
  "esJuridica" BOOLEAN DEFAULT false,  -- true = empresa como administradora
  vigente BOOLEAN DEFAULT true,
  fuente TEXT,           -- "empresia" | "borme"
  UNIQUE("empresaId", "nombreNorm")
);

-- Estado CRM (War Room es la fuente de verdad; pipedriveOrgId sólo es histórico read-only)
CREATE TABLE "CrmEstado" (
  id SERIAL PRIMARY KEY,
  "empresaId" INT UNIQUE REFERENCES "Empresa"(id),
  "pipedriveOrgId" TEXT,              -- legacy, read-only tras cut-over
  "dealStage" TEXT,                   -- "identificado"|"contactado"|"primera_reunion"|"analisis"|"LOI enviada"|"execution"|"portfolio"|"on_hold"|"muerto" (9 stages)
  owner TEXT,                         -- legacy string ("alberto"|"gabriel")
  "ownerUserId" TEXT REFERENCES "User"(id),
  "fechaEntradaStage" TIMESTAMP,      -- cuándo entró al stage actual (para "X días en stage")
  "updatedAt" TIMESTAMP
);

-- Log de cambios CRM (incluye autor desde MVP 1)
CREATE TABLE "CrmLog" (
  id SERIAL PRIMARY KEY,
  "empresaId" INT REFERENCES "Empresa"(id),
  event TEXT,                         -- "new_deal"|"stage_changed"|"removed_from_funnel"
  "fromStage" TEXT,
  "toStage" TEXT,
  owner TEXT,                         -- legacy string
  "autorId" TEXT REFERENCES "User"(id),
  note TEXT,                          -- comentario opcional al cambiar stage
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- (La tabla "Actividad" se eliminó al fusionarla con "Tarea". Lo que antes
--  eran llamadas/emails/reuniones legacy Pipedrive ahora son filas de "Tarea"
--  con completada=true y "resultado" rellenado con el texto original.)

-- Usuarios admin del War Room (MVP 1). Finders tienen tabla aparte (ver más abajo).
CREATE TABLE "User" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  role TEXT DEFAULT 'admin',          -- "admin" | "finder" (reservado MVP 1.5)
  active BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP,
  "updatedAt" TIMESTAMP
);

-- Notas generales de empresa (MVP 1). NO cuentan como "actividad" en el contador de días sin actividad.
CREATE TABLE "Nota" (
  id SERIAL PRIMARY KEY,
  "empresaId" INT REFERENCES "Empresa"(id),
  "autorId" TEXT REFERENCES "User"(id),
  contenido TEXT,
  "createdAt" TIMESTAMP,
  "updatedAt" TIMESTAMP
);

-- Tareas accionables (modelo unificado: trabajo a hacer + registro histórico).
-- Tras fusionar la antigua tabla Actividad, una "tarea" puede representar tanto
-- algo pendiente (completada=false) como un evento ya ocurrido (completada=true
-- + "resultado" relleno con lo que pasó).
CREATE TABLE "Tarea" (
  id SERIAL PRIMARY KEY,
  "empresaId" INT REFERENCES "Empresa"(id),
  tipo TEXT DEFAULT 'otra',           -- "contacto_linkedin"|"mensaje_whatsapp"|"llamada"|"videollamada"|"reunion_presencial"|"email"|"otra"
  titulo TEXT,
  descripcion TEXT,                   -- lo que se pensaba al crear la tarea
  resultado TEXT,                     -- notas post-evento al completar (qué pasó, próximos pasos)
  "fechaLimite" TIMESTAMP,            -- nombre legacy: la fecha asociada al item (puede ser pasada o futura)
  completada BOOLEAN DEFAULT false,
  "completadaAt" TIMESTAMP,
  "asignadoId" TEXT REFERENCES "User"(id),  -- usuario al que está asignada
  "autorId" TEXT REFERENCES "User"(id),     -- quien la creó
  "createdAt" TIMESTAMP,
  "updatedAt" TIMESTAMP
);

-- Finders externos (MVP 1.5 — portal de finders). En MVP 1 sólo se usan como "fuente" de una empresa.
CREATE TABLE "Finder" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  active BOOLEAN DEFAULT true,
  "commissionPct" FLOAT,              -- % de comisión pactado
  "createdAt" TIMESTAMP,
  "updatedAt" TIMESTAMP
);
-- La FK "Empresa.finderSourceId" (si existe) apunta a "Finder".id — indica qué finder trajo la empresa.

-- Notas privadas de un finder sobre una empresa (visibles a admins en la ficha).
CREATE TABLE "FinderNote" (
  id SERIAL PRIMARY KEY,
  "finderId" TEXT REFERENCES "Finder"(id),
  "empresaId" INT REFERENCES "Empresa"(id),
  contenido TEXT,
  "createdAt" TIMESTAMP,
  "updatedAt" TIMESTAMP
);

-- Propuestas de targets nuevos enviadas por finders (aún no aprobadas).
CREATE TABLE "TargetProposal" (
  id SERIAL PRIMARY KEY,
  "finderId" TEXT REFERENCES "Finder"(id),
  "companyName" TEXT,
  cif TEXT,
  status TEXT,                        -- "PENDING"|"APPROVED"|"REJECTED"|"DUPLICATE"
  "empresaId" INT REFERENCES "Empresa"(id),  -- se rellena si se aprueba y crea/vincula Empresa
  "rejectionReason" TEXT,             -- interno, nunca visible al finder
  "createdAt" TIMESTAMP,
  "reviewedAt" TIMESTAMP,
  "reviewedBy" TEXT                   -- User.id del admin que revisó
);

### Notas de negocio
- "enPerimetro" = empresa dentro del perímetro de interés para M&A (true = interesante). Solo empresas enPerimetro=true entran al CRM.
- Los financieros están en euros absolutos. Para calcular márgenes porcentuales: margenBruto/ingresos*100, ebitda/ingresos*100
- Un "Grupo" es un holding o grupo empresarial que puede poseer varias empresas
- Las alertas BORME de tipo "fusion" y "adquisicion" son las más relevantes para M&A
- PersonaCargo con vigente=true son cargos actuales; vigente=false son históricos
- La tabla BormeAlerta tiene backfill de 2 años (desde abril 2024)
- sector "mixto" = empresa que opera tanto en PCI como en seguridad electrónica

### CRM (MVP 1 desde abril 2026)
- El War Room es la fuente de verdad del CRM; Pipedrive se está deprecando. Campo "pipedriveOrgId" es legacy read-only.
- Stages del funnel (9 valores en "CrmEstado.dealStage"): "identificado", "contactado", "primera_reunion", "analisis", "LOI enviada", "execution", "portfolio", "on_hold", "muerto".
- "fechaEntradaStage" indica cuándo la empresa entró al stage ACTUAL (para calcular "días en stage").
- Autoría: cada Nota, Tarea y CrmLog tiene "autorId" apuntando a User.
- Tarea es el modelo unificado de acciones CRM. "completada=false" = pendiente. "completada=true" = registro histórico de algo ya hecho (con "resultado" relleno). "fechaLimite < now() AND completada=false" = vencida.
- Notas generales viven en "Nota" (separado de "Tarea"). NO cuentan como actividad para el contador "días sin actividad" del Kanban — solo Tareas completadas cuentan.
- Finders: un finder externo que "trae" empresas. "Empresa.finderSourceId" indica qué finder introdujo la empresa. Las reglas del portal de finders (sanitización, mapping de stages) entrarán en MVP 1.5.
`;

export const SYSTEM_PROMPT = `Eres un asistente de análisis de datos para Fontiber Industrial Partners, un fondo de M&A especializado en el sector PCI (protección contra incendios) y seguridad electrónica en España.

Tienes acceso a una base de datos PostgreSQL con información de ~5.140 empresas del sector + el CRM interno que gestiona el funnel (contactadas, primera reunión, análisis, LOI, ejecución, portfolio). Puedes ejecutar queries SQL SELECT para responder preguntas.

${DB_SCHEMA}

## Instrucciones
- Responde siempre en español
- Cuando necesites datos, usa la herramienta execute_sql para ejecutar una query SELECT
- Solo puedes ejecutar queries SELECT — nunca INSERT, UPDATE, DELETE, DROP, ALTER, etc.
- Sé conciso y directo en las respuestas
- Cuando presentes datos numéricos financieros, formatea en miles (K) o millones (M) de euros
- Si la pregunta es ambigua, haz tu mejor interpretación y explica brevemente qué asumiste
- Los nombres de columnas en PostgreSQL son case-sensitive y van entre comillas dobles cuando tienen mayúsculas: "empresaId", "codigoPostal", "tipoActo", etc.
- Usa siempre comillas dobles para nombres de tablas y columnas con mayúsculas
- Para JOINs, las foreign keys son: Empresa.grupoId → Grupo.id, Financiero.empresaId → Empresa.id, etc.

## Horizonte temporal
- Cuando el usuario haga preguntas que impliquen datos con dimensión temporal (alertas BORME, datos financieros, actividades CRM, logs) y NO especifique un período concreto, pregúntale si quiere un horizonte de tiempo específico (último mes, último trimestre, último año, etc.) o todo el histórico disponible.
- Al preguntar, indica brevemente el rango de datos disponible (por ejemplo, "Tenemos alertas BORME desde abril 2024" o "Los datos financieros cubren los años 20XX a 20XX").
- Si el usuario ya especifica un período ("este mes", "en 2024", "últimos 6 meses"), usa directamente ese filtro sin preguntar.
- Para preguntas que no tienen dimensión temporal (recuento de empresas, datos estáticos, información de grupos), responde directamente sin preguntar por horizonte.

## Preguntas CRM frecuentes
- "mis tareas pendientes" / "qué tengo que hacer hoy" → filtra "Tarea" con completada=false, JOIN con "User" por "asignadoId".
- "empresas estancadas en X stage" → "CrmEstado" donde dealStage='X' y "fechaEntradaStage" < NOW() - INTERVAL 'N days'.
- "últimas actividades de una empresa" → "Tarea" WHERE "empresaId"=X AND completada=true ORDER BY "completadaAt" DESC.
- "días sin contactar a una empresa" → NOW() - MAX("Tarea"."completadaAt") WHERE "Tarea".completada=true.
- "empresas traídas por un finder" → Empresa WHERE "finderSourceId"=X.
- "conversion rate por stage" → count(*) por dealStage en CrmLog eventos stage_changed.
- Al hablar de tareas/notas/actividades muestra SIEMPRE el nombre de la empresa (JOIN con Empresa) y el autor (JOIN con User) cuando estén disponibles.
`;
