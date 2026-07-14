-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DUPLICATE', 'OUT_OF_SCOPE', 'REJECTED');

-- CreateTable
CREATE TABLE "Grupo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "paisOrigen" TEXT,
    "notas" TEXT,

    CONSTRAINT "Grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" SERIAL NOT NULL,
    "cif" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "codigoPostal" TEXT,
    "telefono" TEXT,
    "localidad" TEXT,
    "provincia" TEXT,
    "ccaa" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sector" TEXT,
    "servicios" TEXT,
    "grupoId" INTEGER,
    "empleados" INTEGER,
    "web" TEXT,
    "linkedin" TEXT,
    "logoUrl" TEXT,
    "descripcion" TEXT,
    "cepreven" TEXT,
    "aerme" BOOLEAN NOT NULL DEFAULT false,
    "ambitoGeo" TEXT,
    "enPerimetro" BOOLEAN NOT NULL DEFAULT true,
    "enPerimetroAt" TIMESTAMP(3),
    "scoreInicial" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "anioConstitucion" INTEGER,
    "esAnonima" BOOLEAN NOT NULL DEFAULT false,
    "oneDriveUrl" TEXT,
    "notionUrl" TEXT,
    "nombreComercial" TEXT,
    "fuente" TEXT NOT NULL DEFAULT 'excel_seed',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finderSourceId" TEXT,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contacto" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailIngestCursor" (
    "upn" TEXT NOT NULL,
    "lastSentDateTime" TIMESTAMP(3) NOT NULL,
    "lastReceivedDateTime" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailIngestCursor_pkey" PRIMARY KEY ("upn")
);

-- CreateTable
CREATE TABLE "EmailIngest" (
    "id" SERIAL NOT NULL,
    "internetMessageId" TEXT NOT NULL,
    "upn" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'saliente',
    "recipientEmail" TEXT NOT NULL,
    "contactoId" INTEGER,
    "empresaId" INTEGER NOT NULL,
    "tareaId" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailIngest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarIngestCursor" (
    "upn" TEXT NOT NULL,
    "lastModifiedDateTime" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarIngestCursor_pkey" PRIMARY KEY ("upn")
);

-- CreateTable
CREATE TABLE "CalendarIngest" (
    "id" SERIAL NOT NULL,
    "iCalUId" TEXT NOT NULL,
    "graphEventId" TEXT NOT NULL,
    "upn" TEXT NOT NULL,
    "organizerEmail" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "contactoId" INTEGER,
    "empresaId" INTEGER NOT NULL,
    "tareaId" INTEGER,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "subject" TEXT,
    "isOnlineMeeting" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarIngest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Financiero" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "ingresos" DOUBLE PRECISION,
    "margenBruto" DOUBLE PRECISION,
    "ebitda" DOUBLE PRECISION,
    "resultadoNeto" DOUBLE PRECISION,
    "fuente" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Financiero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BormeAlerta" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tipoActo" TEXT NOT NULL,
    "descripcion" TEXT,
    "urlBorme" TEXT,
    "leido" BOOLEAN NOT NULL DEFAULT false,
    "grupoInferidoId" INTEGER,
    "personaDetectada" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BormeAlerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BormePersona" (
    "id" SERIAL NOT NULL,
    "alertaId" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nombreNorm" TEXT NOT NULL,
    "rol" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BormePersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaCargo" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nombreNorm" TEXT NOT NULL,
    "nombreOrig" TEXT NOT NULL,
    "rol" TEXT,
    "fechaDesde" TIMESTAMP(3),
    "esJuridica" BOOLEAN NOT NULL DEFAULT false,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "fuente" TEXT NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaCargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmEstado" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "dealStage" TEXT,
    "ownerUserId" TEXT,
    "fechaEntradaStage" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmEstado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLog" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT,
    "autorId" TEXT,
    "autorFinderId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nota" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "autorId" TEXT,
    "autorFinderId" TEXT,
    "contenido" TEXT NOT NULL,
    "visibleAFinder" BOOLEAN NOT NULL DEFAULT false,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tarea" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'otra',
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaLimite" TIMESTAMP(3),
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "completadaAt" TIMESTAMP(3),
    "resultado" TEXT,
    "asignadoId" TEXT,
    "asignadoFinderId" TEXT,
    "autorId" TEXT,
    "autorFinderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tarea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finder" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "commissionPct" DOUBLE PRECISION,
    "passwordHash" TEXT,
    "passwordSetAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "finderId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinderNote" (
    "id" SERIAL NOT NULL,
    "finderId" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "contenido" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinderNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetProposal" (
    "id" SERIAL NOT NULL,
    "finderId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "cif" TEXT,
    "website" TEXT,
    "contactName" TEXT,
    "contactRole" TEXT,
    "notes" TEXT,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "empresaId" INTEGER,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "TargetProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinderAccessLog" (
    "id" SERIAL NOT NULL,
    "finderId" TEXT,
    "email" TEXT,
    "action" TEXT NOT NULL,
    "resourceId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinderAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "finderId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "link" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "leidaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mencion" (
    "id" SERIAL NOT NULL,
    "notaId" INTEGER,
    "tareaId" INTEGER,
    "userId" TEXT,
    "finderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpresaSeenAt" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "userId" TEXT,
    "finderId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmpresaSeenAt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_cif_key" ON "Empresa"("cif");

-- CreateIndex
CREATE INDEX "Empresa_nombre_idx" ON "Empresa"("nombre");

-- CreateIndex
CREATE INDEX "Empresa_fuente_idx" ON "Empresa"("fuente");

-- CreateIndex
CREATE INDEX "Empresa_finderSourceId_idx" ON "Empresa"("finderSourceId");

-- CreateIndex
CREATE INDEX "Empresa_esAnonima_idx" ON "Empresa"("esAnonima");

-- CreateIndex
CREATE INDEX "Contacto_empresaId_idx" ON "Contacto"("empresaId");

-- CreateIndex
CREATE INDEX "Contacto_email_idx" ON "Contacto"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailIngest_internetMessageId_key" ON "EmailIngest"("internetMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailIngest_tareaId_key" ON "EmailIngest"("tareaId");

-- CreateIndex
CREATE INDEX "EmailIngest_upn_idx" ON "EmailIngest"("upn");

-- CreateIndex
CREATE INDEX "EmailIngest_sentAt_idx" ON "EmailIngest"("sentAt");

-- CreateIndex
CREATE INDEX "EmailIngest_empresaId_idx" ON "EmailIngest"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarIngest_iCalUId_key" ON "CalendarIngest"("iCalUId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarIngest_tareaId_key" ON "CalendarIngest"("tareaId");

-- CreateIndex
CREATE INDEX "CalendarIngest_upn_idx" ON "CalendarIngest"("upn");

-- CreateIndex
CREATE INDEX "CalendarIngest_startAt_idx" ON "CalendarIngest"("startAt");

-- CreateIndex
CREATE INDEX "CalendarIngest_empresaId_idx" ON "CalendarIngest"("empresaId");

-- CreateIndex
CREATE INDEX "CalendarIngest_graphEventId_idx" ON "CalendarIngest"("graphEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Financiero_empresaId_anio_key" ON "Financiero"("empresaId", "anio");

-- CreateIndex
CREATE INDEX "BormeAlerta_fecha_idx" ON "BormeAlerta"("fecha");

-- CreateIndex
CREATE INDEX "BormePersona_nombreNorm_idx" ON "BormePersona"("nombreNorm");

-- CreateIndex
CREATE INDEX "BormePersona_empresaId_idx" ON "BormePersona"("empresaId");

-- CreateIndex
CREATE INDEX "BormePersona_alertaId_idx" ON "BormePersona"("alertaId");

-- CreateIndex
CREATE INDEX "PersonaCargo_nombreNorm_idx" ON "PersonaCargo"("nombreNorm");

-- CreateIndex
CREATE INDEX "PersonaCargo_empresaId_idx" ON "PersonaCargo"("empresaId");

-- CreateIndex
CREATE INDEX "PersonaCargo_esJuridica_idx" ON "PersonaCargo"("esJuridica");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaCargo_empresaId_nombreNorm_key" ON "PersonaCargo"("empresaId", "nombreNorm");

-- CreateIndex
CREATE UNIQUE INDEX "CrmEstado_empresaId_key" ON "CrmEstado"("empresaId");

-- CreateIndex
CREATE INDEX "CrmEstado_dealStage_idx" ON "CrmEstado"("dealStage");

-- CreateIndex
CREATE INDEX "CrmEstado_ownerUserId_idx" ON "CrmEstado"("ownerUserId");

-- CreateIndex
CREATE INDEX "CrmLog_empresaId_idx" ON "CrmLog"("empresaId");

-- CreateIndex
CREATE INDEX "CrmLog_createdAt_idx" ON "CrmLog"("createdAt");

-- CreateIndex
CREATE INDEX "CrmLog_autorId_idx" ON "CrmLog"("autorId");

-- CreateIndex
CREATE INDEX "CrmLog_autorFinderId_idx" ON "CrmLog"("autorFinderId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_userId_key" ON "ChatThread"("userId");

-- CreateIndex
CREATE INDEX "Nota_empresaId_createdAt_idx" ON "Nota"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "Nota_autorId_idx" ON "Nota"("autorId");

-- CreateIndex
CREATE INDEX "Nota_autorFinderId_idx" ON "Nota"("autorFinderId");

-- CreateIndex
CREATE INDEX "Nota_parentId_idx" ON "Nota"("parentId");

-- CreateIndex
CREATE INDEX "Tarea_empresaId_idx" ON "Tarea"("empresaId");

-- CreateIndex
CREATE INDEX "Tarea_fechaLimite_completada_idx" ON "Tarea"("fechaLimite", "completada");

-- CreateIndex
CREATE INDEX "Tarea_asignadoId_completada_idx" ON "Tarea"("asignadoId", "completada");

-- CreateIndex
CREATE INDEX "Tarea_asignadoFinderId_completada_idx" ON "Tarea"("asignadoFinderId", "completada");

-- CreateIndex
CREATE INDEX "Tarea_autorFinderId_idx" ON "Tarea"("autorFinderId");

-- CreateIndex
CREATE INDEX "Tarea_tipo_idx" ON "Tarea"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Finder_email_key" ON "Finder"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_finderId_usedAt_idx" ON "PasswordResetToken"("finderId", "usedAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "FinderNote_finderId_idx" ON "FinderNote"("finderId");

-- CreateIndex
CREATE INDEX "FinderNote_empresaId_idx" ON "FinderNote"("empresaId");

-- CreateIndex
CREATE INDEX "TargetProposal_finderId_idx" ON "TargetProposal"("finderId");

-- CreateIndex
CREATE INDEX "TargetProposal_status_idx" ON "TargetProposal"("status");

-- CreateIndex
CREATE INDEX "FinderAccessLog_finderId_idx" ON "FinderAccessLog"("finderId");

-- CreateIndex
CREATE INDEX "FinderAccessLog_finderId_createdAt_idx" ON "FinderAccessLog"("finderId", "createdAt");

-- CreateIndex
CREATE INDEX "FinderAccessLog_action_createdAt_idx" ON "FinderAccessLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "FinderAccessLog_createdAt_idx" ON "FinderAccessLog"("createdAt");

-- CreateIndex
CREATE INDEX "FinderAccessLog_email_idx" ON "FinderAccessLog"("email");

-- CreateIndex
CREATE INDEX "Notificacion_userId_leida_createdAt_idx" ON "Notificacion"("userId", "leida", "createdAt");

-- CreateIndex
CREATE INDEX "Notificacion_finderId_leida_createdAt_idx" ON "Notificacion"("finderId", "leida", "createdAt");

-- CreateIndex
CREATE INDEX "Mencion_userId_createdAt_idx" ON "Mencion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Mencion_finderId_createdAt_idx" ON "Mencion"("finderId", "createdAt");

-- CreateIndex
CREATE INDEX "Mencion_notaId_idx" ON "Mencion"("notaId");

-- CreateIndex
CREATE INDEX "Mencion_tareaId_idx" ON "Mencion"("tareaId");

-- CreateIndex
CREATE INDEX "EmpresaSeenAt_userId_idx" ON "EmpresaSeenAt"("userId");

-- CreateIndex
CREATE INDEX "EmpresaSeenAt_finderId_idx" ON "EmpresaSeenAt"("finderId");

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaSeenAt_empresaId_userId_key" ON "EmpresaSeenAt"("empresaId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaSeenAt_empresaId_finderId_key" ON "EmpresaSeenAt"("empresaId", "finderId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorType_actorId_createdAt_idx" ON "AuditLog"("actorType", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Empresa" ADD CONSTRAINT "Empresa_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empresa" ADD CONSTRAINT "Empresa_finderSourceId_fkey" FOREIGN KEY ("finderSourceId") REFERENCES "Finder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contacto" ADD CONSTRAINT "Contacto_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailIngest" ADD CONSTRAINT "EmailIngest_contactoId_fkey" FOREIGN KEY ("contactoId") REFERENCES "Contacto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailIngest" ADD CONSTRAINT "EmailIngest_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarIngest" ADD CONSTRAINT "CalendarIngest_contactoId_fkey" FOREIGN KEY ("contactoId") REFERENCES "Contacto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarIngest" ADD CONSTRAINT "CalendarIngest_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Financiero" ADD CONSTRAINT "Financiero_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BormeAlerta" ADD CONSTRAINT "BormeAlerta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BormeAlerta" ADD CONSTRAINT "BormeAlerta_grupoInferidoId_fkey" FOREIGN KEY ("grupoInferidoId") REFERENCES "Grupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BormePersona" ADD CONSTRAINT "BormePersona_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "BormeAlerta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BormePersona" ADD CONSTRAINT "BormePersona_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaCargo" ADD CONSTRAINT "PersonaCargo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmEstado" ADD CONSTRAINT "CrmEstado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmEstado" ADD CONSTRAINT "CrmEstado_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLog" ADD CONSTRAINT "CrmLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLog" ADD CONSTRAINT "CrmLog_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLog" ADD CONSTRAINT "CrmLog_autorFinderId_fkey" FOREIGN KEY ("autorFinderId") REFERENCES "Finder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_autorFinderId_fkey" FOREIGN KEY ("autorFinderId") REFERENCES "Finder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nota" ADD CONSTRAINT "Nota_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Nota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_asignadoId_fkey" FOREIGN KEY ("asignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_asignadoFinderId_fkey" FOREIGN KEY ("asignadoFinderId") REFERENCES "Finder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_autorFinderId_fkey" FOREIGN KEY ("autorFinderId") REFERENCES "Finder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_finderId_fkey" FOREIGN KEY ("finderId") REFERENCES "Finder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinderNote" ADD CONSTRAINT "FinderNote_finderId_fkey" FOREIGN KEY ("finderId") REFERENCES "Finder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinderNote" ADD CONSTRAINT "FinderNote_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetProposal" ADD CONSTRAINT "TargetProposal_finderId_fkey" FOREIGN KEY ("finderId") REFERENCES "Finder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetProposal" ADD CONSTRAINT "TargetProposal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinderAccessLog" ADD CONSTRAINT "FinderAccessLog_finderId_fkey" FOREIGN KEY ("finderId") REFERENCES "Finder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_finderId_fkey" FOREIGN KEY ("finderId") REFERENCES "Finder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mencion" ADD CONSTRAINT "Mencion_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "Nota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mencion" ADD CONSTRAINT "Mencion_tareaId_fkey" FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mencion" ADD CONSTRAINT "Mencion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mencion" ADD CONSTRAINT "Mencion_finderId_fkey" FOREIGN KEY ("finderId") REFERENCES "Finder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpresaSeenAt" ADD CONSTRAINT "EmpresaSeenAt_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpresaSeenAt" ADD CONSTRAINT "EmpresaSeenAt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpresaSeenAt" ADD CONSTRAINT "EmpresaSeenAt_finderId_fkey" FOREIGN KEY ("finderId") REFERENCES "Finder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
