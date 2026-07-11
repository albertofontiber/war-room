import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SYSTEM_PROMPT } from "@/lib/chat-schema";
import { getCurrentUser } from "@/lib/user-from-session";
import { buildChatTools } from "@/lib/chat-tools";

export const dynamic = "force-dynamic";
// 60s: con 16 pasos de tools posibles, 30s cortaba a medias las cadenas
// largas (buscar → varias queries → crear → verificar).
export const maxDuration = 60;

/**
 * POST /api/chat — agente del War Room (streaming).
 *
 * Este route solo autentica y compone. Los tools viven en
 * `src/lib/chat-tools/` (un módulo por dominio, testeables por separado);
 * el guard SQL en `src/lib/chat-sql-guard.ts`; la conexión de solo lectura
 * de execute_sql en `src/lib/chat-db.ts`; el system prompt en
 * `src/lib/chat-schema.ts`.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  // Solo admins. El chat ejecuta SELECT arbitrario sobre toda la BD — un
  // finder con sesión activa no debe poder leer CIFs, financieros, password
  // hashes, etc.
  if (!session || session.kind !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  // El user.id se necesita para autoría (tareas, CrmLog, AuditLog). Lo
  // capturamos una sola vez por request — los tools lo reciben vía contexto.
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  // Strip 'id' field — convertToModelMessages expects Omit<UIMessage, 'id'>
  const messagesWithoutId = (body.messages || []).map(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ id, ...rest }: { id: string; [key: string]: unknown }) => rest
  );
  const modelMessages = await convertToModelMessages(messagesWithoutId);

  const result = streamText({
    model: anthropic("claude-sonnet-5"),
    // El system prompt va como mensajes de sistema (no como `system:`) para
    // poder partirlo en dos bloques:
    // 1. SYSTEM_PROMPT (~5k tokens, estático) con cache de Anthropic — los
    //    turnos siguientes lo leen a ~10% del coste y con menos latencia.
    //    OJO: el bloque cacheado debe ser byte-idéntico entre requests; nada
    //    dinámico (fechas, ids) puede entrar en él o se invalida el cache.
    // 2. La fecha actual, por request y FUERA del bloque cacheado. Antes vivía
    //    interpolada en SYSTEM_PROMPT y se evaluaba al cargar el módulo: en
    //    lambdas calientes el modelo creía que "hoy" era la fecha del cold
    //    start y convertía mal "mañana"/"el viernes" al crear tareas.
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      {
        role: "system",
        content: `Fecha y hora actuales: ${new Date().toISOString()} (el usuario está en Europe/Madrid).`,
      },
      ...modelMessages,
    ],
    // 16 pasos: con 8, las cadenas largas (buscar_empresa → varias queries →
    // crear/actualizar → verificar) se quedaban a medias y el agente "se rendía".
    stopWhen: stepCountIs(16),
    tools: buildChatTools({ currentUser: { id: currentUser.id } }),
  });

  return result.toUIMessageStreamResponse();
}
