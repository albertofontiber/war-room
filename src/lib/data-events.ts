/**
 * Bus de eventos in-process para invalidación de datos en cliente.
 *
 * Cualquier mutación cliente-side (PATCH/POST/DELETE) dispatchea
 * `wr:data-changed` con un `DataChangedDetail` que indica qué recurso se tocó.
 * Los componentes que muestran datos derivados escuchan el mismo evento y
 * filtran por `resource` (y opcionalmente `parent` para entidades anidadas).
 *
 * Diseño:
 *   - **Un solo evento con discriminator**. Un componente que muestra
 *     "última actividad" puede reaccionar a CUALQUIER mutación sin mantener
 *     N listeners. Añadir un recurso nuevo no requiere un evento nuevo.
 *   - **`window.dispatchEvent`**, no Zustand/SWR/React Query. Acoplamiento
 *     mínimo: productor y consumidor no se conocen, cero dependencias.
 *   - **`parent` opcional** para entidades anidadas (tarea bajo empresa,
 *     contacto bajo empresa). El consumidor decide si filtra solo por
 *     `resource` o también por `parent`.
 *
 * Antes esto se llamaba `wr:empresa-changed` y solo cubría entidades bajo
 * Empresa. Renombrado a `wr:data-changed` en 2026-05-15 para que cualquier
 * formulario admin (finders, grupos, propuestas, users…) pueda emitir y
 * cualquier lista escuchar — el bug "tras guardar comisión de finder hay
 * que F5" se origina en que finders no tenía equivalente al bus existente.
 *
 * Si en el futuro hace falta cross-tab, cambiar a `BroadcastChannel`
 * manteniendo la misma forma de payload.
 */

export const DATA_CHANGED_EVENT = "wr:data-changed";

/**
 * Recursos que pueden notificar cambios. La lista refleja las entidades
 * de primer nivel del War Room + las anidadas que ya tenían bus
 * (tarea/nota/stage/contacto/documentacion bajo Empresa).
 *
 * Para añadir uno nuevo: agregarlo aquí y emitir/consumir el evento donde
 * corresponda. NO inventes nombres ad-hoc en strings sueltos.
 */
export type ResourceKind =
  // Entidades de primer nivel
  | "empresa"
  | "finder"
  | "grupo"
  | "user"
  | "propuesta"
  | "notificacion"
  // Entidades bajo empresa (antes EmpresaChangedEntity)
  | "tarea"
  | "nota"
  | "stage"
  | "contacto"
  | "documentacion";

export type DataChangedDetail = {
  /** Qué recurso ha mutado. Discriminator principal. */
  resource: ResourceKind;
  /** ID concreto de la entidad mutada. Opcional — algunos productores
   *  notifican "algo del recurso X cambió" sin saber el id (ej. chat IA
   *  con tools batch). */
  resourceId?: string | number;
  /** Tipo de mutación. Opcional. */
  action?: "create" | "update" | "delete";
  /** Para entidades anidadas (tarea bajo empresa, contacto bajo empresa…)
   *  contexto del padre. Permite que un listener filtre por empresa. */
  parent?: { resource: ResourceKind; id: string | number };
  /** Etiqueta del productor: "manual", nombre del tool del chat, "cron"… */
  source?: string;
};

/**
 * Emite el evento. No-op en SSR para que llamarlo desde código compartido
 * sea seguro.
 */
export function dispatchDataChanged(detail: DataChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail }));
}

/**
 * Suscriptor con filtro tipado. Devuelve la función de unsubscribe — útil
 * para usar dentro de un `useEffect`:
 *
 *   useEffect(() => subscribeDataChanged(
 *     { resource: "finder" },
 *     () => reload()
 *   ), []);
 *
 * El filtro es AND: el callback solo se invoca si TODOS los campos
 * presentes en `filter` coinciden con el detail del evento.
 */
export type DataChangedFilter = Partial<
  Pick<DataChangedDetail, "resource" | "resourceId" | "action">
> & {
  parent?: { resource?: ResourceKind; id?: string | number };
};

export function subscribeDataChanged(
  filter: DataChangedFilter,
  callback: (detail: DataChangedDetail) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent<DataChangedDetail>).detail;
    if (!detail) return;
    if (filter.resource && detail.resource !== filter.resource) return;
    if (
      filter.resourceId !== undefined &&
      detail.resourceId !== filter.resourceId
    )
      return;
    if (filter.action && detail.action !== filter.action) return;
    if (filter.parent) {
      if (!detail.parent) return;
      if (
        filter.parent.resource &&
        detail.parent.resource !== filter.parent.resource
      )
        return;
      if (filter.parent.id !== undefined && detail.parent.id !== filter.parent.id)
        return;
    }
    callback(detail);
  };
  window.addEventListener(DATA_CHANGED_EVENT, handler);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
}
