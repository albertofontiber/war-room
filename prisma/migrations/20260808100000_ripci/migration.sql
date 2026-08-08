-- Categorías del RIPCI (RD 513/2017), separadas por sección: instalación y
-- mantenimiento. Mantenimiento tiene una categoría más que instalación —la
-- (C) Extintores de incendios—, así que no se pueden guardar en un solo saco.
--
-- Va en jsonb, como `habilitaciones`, para poder filtrar en SQL desde el chat
-- ("quién instala rociadores") sin recorrer la tabla entera.

-- AlterTable
ALTER TABLE "Empresa"
ADD COLUMN "ripci" JSONB,
ADD COLUMN "ripciAlta" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Empresa_ripci_idx" ON "Empresa" USING GIN ("ripci");
