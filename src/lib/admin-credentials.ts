export type AdminCredentialConfig = {
  username: string;
  email: string;
  password?: string;
  passwordHash?: string;
};

/**
 * Fuente única para las dos identidades que pueden entrar al war room.
 *
 * Las variables de entorno siguen siendo el arranque/fallback. Si un admin
 * usa el flujo de recuperación, User.passwordHash pasa a tener prioridad y la
 * contraseña antigua de entorno deja de funcionar para esa cuenta.
 */
export function getAdminCredentialConfigs(): AdminCredentialConfig[] {
  return [
    {
      username: process.env.ADMIN_USER_1 ?? "alberto",
      email: `${process.env.ADMIN_USER_1 ?? "alberto"}@fontiber.com`,
      password: process.env.ADMIN_PASS_1,
      passwordHash: process.env.ADMIN_PASS_HASH_1,
    },
    {
      username: process.env.ADMIN_USER_2 ?? "gabriel",
      email: `${process.env.ADMIN_USER_2 ?? "gabriel"}@fontiber.com`,
      password: process.env.ADMIN_PASS_2,
      passwordHash: process.env.ADMIN_PASS_HASH_2,
    },
  ].map((config) => ({
    ...config,
    username: config.username.trim().toLowerCase(),
    email: config.email.trim().toLowerCase(),
  }));
}

export function findAdminCredentialByUsername(
  username: string
): AdminCredentialConfig | undefined {
  const normalized = username.trim().toLowerCase();
  return getAdminCredentialConfigs().find(
    (config) => config.username === normalized
  );
}

export function isConfiguredAdminEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return getAdminCredentialConfigs().some(
    (config) => config.email === normalized
  );
}
