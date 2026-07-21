export type AdminCredentialConfig = {
  email: string;
  password?: string;
  passwordHash?: string;
};

function configuredAdminEmail(
  explicitEmail: string | undefined,
  legacyUsername: string | undefined,
  fallbackUsername: string
): string {
  const identifier =
    explicitEmail?.trim() || legacyUsername?.trim() || fallbackUsername;
  const normalized = identifier.toLowerCase();
  return normalized.includes("@")
    ? normalized
    : `${normalized}@fontiber.com`;
}

/**
 * Fuente única para las dos identidades que pueden entrar al war room.
 *
 * `ADMIN_EMAIL_n` es el identificador de acceso. `ADMIN_USER_n` se acepta
 * únicamente como configuración legacy para no exigir cambios inmediatos en
 * los despliegues existentes. Si un admin usa el flujo de recuperación,
 * User.passwordHash pasa a tener prioridad y la contraseña antigua de entorno
 * deja de funcionar para esa cuenta.
 */
export function getAdminCredentialConfigs(): AdminCredentialConfig[] {
  return [
    {
      email: configuredAdminEmail(
        process.env.ADMIN_EMAIL_1,
        process.env.ADMIN_USER_1,
        "alberto"
      ),
      password: process.env.ADMIN_PASS_1,
      passwordHash: process.env.ADMIN_PASS_HASH_1,
    },
    {
      email: configuredAdminEmail(
        process.env.ADMIN_EMAIL_2,
        process.env.ADMIN_USER_2,
        "gabriel"
      ),
      password: process.env.ADMIN_PASS_2,
      passwordHash: process.env.ADMIN_PASS_HASH_2,
    },
  ];
}

export function findAdminCredentialByEmail(
  email: string
): AdminCredentialConfig | undefined {
  const normalized = email.trim().toLowerCase();
  return getAdminCredentialConfigs().find(
    (config) => config.email === normalized
  );
}

export function isConfiguredAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return getAdminCredentialConfigs().some(
    (config) => config.email === normalized
  );
}
