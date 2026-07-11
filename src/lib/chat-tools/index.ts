// ─── Composición de los tools del chat IA ────────────────────────────────────
// Un módulo por dominio, un builder por tool. El route
// (src/app/api/chat/route.ts) solo autentica y compone; cada tool es
// testeable/revisable por separado. Al añadir un tool nuevo:
//   1. Crear el builder en su módulo (o uno nuevo) y añadirlo aquí.
//   2. Documentarlo en el system prompt (src/lib/chat-schema.ts).
//   3. Si muta datos, mapearlo en TOOL_TO_RESOURCE de ChatIA.tsx (bus refresh).

import { buildExecuteSqlTool } from "./execute-sql";
import { buildBuscarEmpresaTool } from "./empresas";
import { buildCrearTareaTool, buildActualizarTareaTool } from "./tareas";
import {
  buildBuscarContactoTool,
  buildCrearContactoTool,
  buildActualizarContactoTool,
} from "./contactos";
import { buildCambiarEtapaTool } from "./cambiar-etapa";
import {
  buildActividadFindersTool,
  buildResumenActividadFindersTool,
} from "./finders";
import type { ChatToolContext } from "./types";

export type { ChatToolContext } from "./types";

export function buildChatTools(ctx: ChatToolContext) {
  return {
    execute_sql: buildExecuteSqlTool(),
    buscar_empresa: buildBuscarEmpresaTool(),
    crear_tarea: buildCrearTareaTool(ctx),
    actualizar_tarea: buildActualizarTareaTool(ctx),
    buscar_contacto: buildBuscarContactoTool(),
    crear_contacto: buildCrearContactoTool(ctx),
    actualizar_contacto: buildActualizarContactoTool(ctx),
    cambiar_etapa: buildCambiarEtapaTool(ctx),
    actividad_finders: buildActividadFindersTool(),
    resumen_actividad_finders: buildResumenActividadFindersTool(),
  };
}
