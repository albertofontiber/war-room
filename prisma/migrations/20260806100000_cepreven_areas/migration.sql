-- Áreas de calificación Cepreven (rociadores de riesgo ordinario, detección
-- automática, compartimentación…) como JSON: ["EAA-RO","DAI"].
--
-- Aditiva y reversible: columna nueva, opcional y sin defecto. No toca
-- `cepreven`, que sigue guardando el estado ("asociada" / "calificada").

-- AlterTable
ALTER TABLE "Empresa"
ADD COLUMN "ceprevenAreas" TEXT;
