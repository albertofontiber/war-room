-- Habilitaciones del Registro de Seguridad Privada.
--
-- El ámbito es POR habilitación, no por empresa: hay empresas que instalan con
-- licencia autonómica y tienen la central de alarmas con licencia estatal. Por
-- eso no basta con `ambitoGeo`, que guarda una sola letra.
--
-- Va en jsonb —y no como texto, que es lo que hacen `servicios` y
-- `ceprevenAreas`— porque sobre esta columna sí se filtra: tanto el War Room
-- como el chat necesitan preguntar "¿quién tiene central receptora de alarmas?"
-- con `habilitaciones->>'CA' IS NOT NULL`.
--
-- Aditiva y reversible: dos columnas nuevas, opcionales y sin defecto.

-- AlterTable
ALTER TABLE "Empresa"
ADD COLUMN "habilitaciones" JSONB,
ADD COLUMN "registroFuente" TEXT;

-- Índice GIN: sin él, filtrar por habilitación obliga a recorrer las 5.128
-- filas. Con él, `habilitaciones ? 'CA'` y `habilitaciones @> '{"CA":"E"}'`
-- resuelven por índice.
CREATE INDEX "Empresa_habilitaciones_idx" ON "Empresa" USING GIN ("habilitaciones");
