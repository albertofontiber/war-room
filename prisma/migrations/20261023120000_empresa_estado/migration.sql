-- Estado legal de la empresa según SABI/Informa (extracción oct 2026).
ALTER TABLE "Empresa" ADD COLUMN "estado" TEXT;
ALTER TABLE "Empresa" ADD COLUMN "estadoAt" TIMESTAMP(3);
