-- Preferencia de cada usuario del war room: recibir o no el email diario
-- (señales del BORME + perímetro). Se gestiona desde "Mi cuenta". Por defecto
-- activado, para que Alberto y Gabriel lo sigan recibiendo como hasta ahora.

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "emailDiario" BOOLEAN NOT NULL DEFAULT true;
