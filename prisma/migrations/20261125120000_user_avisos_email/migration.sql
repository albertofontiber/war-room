-- Avisos por email gestionables desde "Mi cuenta", apagados por defecto.
--
-- Hasta ahora las notificaciones con correo (carpeta + página de un target,
-- altas mensuales de los registros, propuestas de finders) llegaban a todos
-- los admins activos. Pasan a enviarse solo a quien las activa. Alberto y
-- Gabriel las conservan activadas; el resto puede activarlas en Mi cuenta.
--
-- El email diario ya era configurable: cada usuario conserva su valor y solo
-- cambia el valor por defecto de las cuentas nuevas.

-- AlterTable
ALTER TABLE "User"
ALTER COLUMN "emailDiario" SET DEFAULT false,
ADD COLUMN "emailRegistros" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailCarpetas" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailPropuestas" BOOLEAN NOT NULL DEFAULT false;

-- Destinatarios actuales que siguen recibiéndolos.
UPDATE "User"
SET "emailRegistros" = true, "emailCarpetas" = true, "emailPropuestas" = true
WHERE lower("email") IN ('alberto@fontiber.com', 'gabriel@fontiber.com');

-- El rol de lectura del chat tiene permisos por columna en "User": sin este
-- GRANT, un SELECT * del chat sobre "User" fallaría. En bases sin el rol
-- (CI, desarrollo) no hace nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'warroom_chat_readonly') THEN
    GRANT SELECT ("emailRegistros", "emailCarpetas", "emailPropuestas") ON "User" TO warroom_chat_readonly;
  END IF;
END $$;
