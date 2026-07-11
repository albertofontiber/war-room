// ─── Contexto compartido por los tools del chat IA ──────────────────────────
// Cada tool se construye por request con el usuario autenticado (autoría de
// tareas, CrmLog, AuditLog). Ver `index.ts` para la composición.

export type ChatToolContext = {
  /** Admin autenticado (User.id) — autor de las mutaciones. */
  currentUser: { id: string };
};
