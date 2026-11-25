/**
 * Avisos por email que cada usuario del war room activa o no en Mi cuenta.
 *
 * Cada aviso es una columna booleana de `User`, apagada por defecto: un
 * usuario nuevo no recibe ningún correo hasta que lo pide. La campanita de la
 * app no depende de estas preferencias.
 *
 * Un aviso nuevo que envíe correo a varios admins necesita su entrada aquí,
 * su columna en `User` (migración incluida) y su clave en
 * `CuentaPreferenciasSchema`. `notifyAdmins` solo manda email a quien tenga
 * activado el aviso que se le indica.
 *
 * Sin imports de servidor: lo usa también la página de Mi cuenta.
 */

export const AVISOS_EMAIL = [
  {
    campo: "emailDiario",
    titulo: "Email diario del BORME",
    descripcion:
      "Cada mañana, las señales del BORME y los cambios de perímetro del día anterior.",
  },
  {
    campo: "emailRegistros",
    titulo: "Empresas nuevas de los registros",
    descripcion:
      "El día 1 de cada mes, las altas de Cepreven, seguridad privada y RIPCI y las incidencias de esa actualización.",
  },
  {
    campo: "emailCarpetas",
    titulo: "Carpetas y páginas de targets",
    descripcion:
      "Cuando una empresa pasa a 1ª reunión y se crean su carpeta de OneDrive y su página de Notion (o falla la creación), y el repaso semanal si crea alguna.",
  },
  {
    campo: "emailPropuestas",
    titulo: "Propuestas de finders",
    descripcion: "Cuando un finder propone un target nuevo.",
  },
] as const;

export type AvisoEmail = (typeof AVISOS_EMAIL)[number]["campo"];

export type PreferenciasAvisos = Record<AvisoEmail, boolean>;

/** `select` de Prisma con todas las preferencias de avisos de `User`. */
export const SELECT_AVISOS_EMAIL = {
  emailDiario: true,
  emailRegistros: true,
  emailCarpetas: true,
  emailPropuestas: true,
} as const satisfies Record<AvisoEmail, true>;
