/**
 * Reparto de las tareas pendientes del digest diario: a quién pertenece cada
 * una y en qué ventana temporal cae.
 *
 * Vive aparte de `email-task-digest.ts` (que habla con Prisma y Resend) para
 * que la regla de negocio — la parte que decide si una tarea se ve o no — sea
 * una función pura y testeable.
 *
 * Regla de propiedad:
 *   1. Si la tarea tiene asignado admin → es de ese admin.
 *   2. Si está asignada a un finder → NO entra en el digest de admins; el
 *      finder la ve en su portal y recibe su propio email.
 *   3. Si no tiene asignado ninguno → es de quien la creó, hasta que la
 *      delegue. Antes estas tareas quedaban fuera del digest por completo
 *      (el WHERE exigía `asignadoId != null`) y desaparecían en silencio.
 */

/** Usuario al que se le puede atribuir una tarea (asignado o autor). */
export type DigestUserRef = {
  id: string;
  email: string;
  name: string;
  active: boolean;
} | null;

/** Tarea pendiente tal y como la carga el digest desde Prisma. */
export type TareaPendiente = {
  id: number;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  fechaLimite: Date | null;
  empresa: { id: number; nombre: string };
  asignado: DigestUserRef;
  asignadoFinderId: string | null;
  autor: DigestUserRef;
};

/** Fila ya lista para pintar en el email. */
export type TareaRow = {
  id: number;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  fechaLimite: Date | null;
  empresa: { id: number; nombre: string };
  /** true cuando nadie la tiene asignada y se atribuye a su autor. */
  sinAsignar: boolean;
};

export type Bucket = {
  vencidas: TareaRow[];
  hoy: TareaRow[];
  proximos7: TareaRow[];
  sinFecha: TareaRow[];
};

export type DigestEntry = { email: string; name: string; bucket: Bucket };

export type DigestAdmin = { id: string; email: string; name: string };

export function emptyBucket(): Bucket {
  return { vencidas: [], hoy: [], proximos7: [], sinFecha: [] };
}

/**
 * A quién le toca la tarea. Devuelve null si no le corresponde a ningún admin
 * (asignada a un finder, o sin asignar y sin autor — p. ej. las que crean los
 * crones de email/calendar).
 */
export function responsableDeTarea(t: TareaPendiente): DigestUserRef {
  if (t.asignado) return t.asignado;
  if (t.asignadoFinderId) return null;
  return t.autor;
}

/**
 * Agrupa las tareas pendientes por usuario y por ventana temporal.
 *
 * Arranca el mapa con TODOS los admins activos: reciben email aunque no
 * tengan tareas, porque el bloque "CRM update" puede traer actividad de
 * finders. Un asignado que no esté en esa lista (rol distinto) se añade al
 * vuelo para no perder la tarea.
 *
 * @param hoy0 medianoche de hoy, en la zona horaria del servidor.
 */
export function agruparTareasPorUsuario(
  admins: DigestAdmin[],
  tareas: TareaPendiente[],
  hoy0: Date
): Map<string, DigestEntry> {
  const maniana0 = new Date(hoy0);
  maniana0.setDate(maniana0.getDate() + 1);
  const enOcho0 = new Date(hoy0);
  enOcho0.setDate(enOcho0.getDate() + 8);

  const porUsuario = new Map<string, DigestEntry>();
  for (const a of admins) {
    porUsuario.set(a.id, { email: a.email, name: a.name, bucket: emptyBucket() });
  }

  for (const t of tareas) {
    const u = responsableDeTarea(t);
    if (!u || !u.active) continue;

    let entry = porUsuario.get(u.id);
    if (!entry) {
      entry = { email: u.email, name: u.name, bucket: emptyBucket() };
      porUsuario.set(u.id, entry);
    }

    const row: TareaRow = {
      id: t.id,
      titulo: t.titulo,
      descripcion: t.descripcion,
      tipo: t.tipo,
      fechaLimite: t.fechaLimite,
      empresa: t.empresa,
      sinAsignar: !t.asignado,
    };

    if (!t.fechaLimite) {
      entry.bucket.sinFecha.push(row);
    } else if (t.fechaLimite < hoy0) {
      entry.bucket.vencidas.push(row);
    } else if (t.fechaLimite < maniana0) {
      entry.bucket.hoy.push(row);
    } else if (t.fechaLimite < enOcho0) {
      entry.bucket.proximos7.push(row);
    }
    // Tareas con fechaLimite > hoy+7 no entran en el digest: ya asomarán
    // cuando se acerquen.
  }

  return porUsuario;
}
