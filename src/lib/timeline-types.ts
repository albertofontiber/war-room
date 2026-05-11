/**
 * Tipos del Timeline — separados del helper server (`lib/timeline.ts`) para
 * que el cliente pueda importarlos sin arrastrar `prisma` al bundle del
 * browser.
 *
 * Las variantes de `TimelineEvent` están discriminadas por `kind`. Cada una
 * lleva `density` ('full' | 'compact') que el renderer usa para decidir si
 * pinta una card completa o una línea compacta.
 */

export type TimelineActor = {
  kind: "admin" | "finder" | "system";
  id: string | null;
  name: string;
};

export type TimelineEvent =
  | {
      kind: "nota";
      id: string;
      fecha: string;
      actor: TimelineActor;
      density: "full";
      payload: {
        notaId: number;
        contenido: string;
        parentId: number | null;
        visibleAFinder: boolean;
      };
    }
  | {
      kind: "tarea_completada";
      id: string;
      fecha: string;
      actor: TimelineActor;
      density: "full";
      payload: {
        tareaId: number;
        tipo: string;
        titulo: string;
        resultado: string | null;
        source: "manual" | "graph-email" | "graph-calendar";
      };
    }
  | {
      kind: "stage_changed";
      id: string;
      fecha: string;
      actor: TimelineActor;
      density: "compact";
      payload: {
        from: string | null;
        to: string | null;
        note: string | null;
      };
    }
  | {
      kind: "borme";
      id: string;
      fecha: string;
      actor: TimelineActor;
      density: "full";
      payload: {
        bormeAlertaId: number;
        tipoActo: string;
        descripcion: string | null;
        urlBorme: string | null;
        grupoInferidoNombre: string | null;
        personaDetectada: string | null;
      };
    };

export type TimelineScope = "admin" | "portal";

export type TimelineOptions = {
  scope: TimelineScope;
  finderId?: string;
  userId?: string;
};

/**
 * Categorías visibles en el UI. Cada `kind` mapea a una categoría que el
 * usuario puede toggle on/off. "Sistema" reservada para futuros eventos de
 * AuditLog (creación de docs, edición de campos triviales) — vacía hoy.
 */
export type TimelineCategory =
  | "conversacion"
  | "actividad"
  | "pipeline"
  | "senales"
  | "sistema";

export function categoryForKind(kind: TimelineEvent["kind"]): TimelineCategory {
  switch (kind) {
    case "nota":
      return "conversacion";
    case "tarea_completada":
      return "actividad";
    case "stage_changed":
      return "pipeline";
    case "borme":
      return "senales";
  }
}
