-- Cambio aditivo: ausencia de revisión no equivale a ausencia de actividad.
ALTER TABLE "Empresa"
  ADD COLUMN "proteccionPasiva" BOOLEAN,
  ADD COLUMN "pasivaServicios" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "pasivaEvidencias" JSONB,
  ADD COLUMN "pasivaRevisadaAt" TIMESTAMP(3);
