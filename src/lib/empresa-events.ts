/**
 * Bus de eventos in-process para cambios sobre una empresa.
 *
 * Cualquier productor (chat IA con tools, futuras integraciones realtime)
 * que modifique algo bajo una empresa dispara `wr:empresa-changed` con un
 * `EmpresaChangedDetail` que indica qué entidad se tocó. Cualquier widget
 * que muestre datos derivados (TareasSection, NotasSection, badges, KPIs)
 * escucha el mismo evento y filtra por `entity` + `empresaId`.
 *
 * Por qué un solo evento con discriminator en lugar de eventos por entidad:
 *   - Un widget que muestra "última actividad" puede querer reaccionar a
 *     CUALQUIER cambio sobre la empresa sin mantener N listeners.
 *   - Añadir una entidad nueva (`crear_nota`, `cambiar_stage`) no requiere
 *     un evento nuevo: solo un valor nuevo en el union de `entity`.
 *
 * Por qué `window.dispatchEvent` y no Zustand/SWR/React Query:
 *   - Acoplamiento mínimo: productor y consumidor no se conocen.
 *   - Cero dependencias nuevas. El listener vive en cada componente que lo
 *     necesita y se limpia con su unmount.
 *
 * Si en el futuro hace falta cross-tab (otra pestaña del mismo usuario),
 * cambiar a BroadcastChannel manteniendo la misma forma del payload.
 */

export const EMPRESA_CHANGED_EVENT = "wr:empresa-changed";

/**
 * Entidades posibles. Mantener sincronizado con los toolName del chat
 * (`crear_tarea` → "tarea", futuro `crear_nota` → "nota", etc.).
 */
export type EmpresaChangedEntity =
  | "tarea"
  | "nota"
  | "stage"
  | "contacto"
  | "documentacion";

export type EmpresaChangedDetail = {
  empresaId: number;
  entity: EmpresaChangedEntity;
  /** ID de la entidad concreta (taskId, notaId, contactoId…). Opcional. */
  entityId?: number;
  /** create / update / delete. Opcional — algunos productores no lo distinguen. */
  action?: "create" | "update" | "delete";
  /** Nombre del productor (toolName del chat, "manual", "cron", etc.). */
  source?: string;
};

/**
 * Helper tipado para emitir el evento. Se puede llamar tanto desde el
 * dispatcher del chat como desde cualquier otro productor in-process.
 */
export function dispatchEmpresaChanged(detail: EmpresaChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EMPRESA_CHANGED_EVENT, { detail }));
}
