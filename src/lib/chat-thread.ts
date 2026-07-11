// ─── Persistencia del historial del chat IA ──────────────────────────────────
// Un hilo activo por admin (ChatThread.userId @unique). Guarda los UIMessages
// del AI SDK como JSON; el cliente los rehidrata al abrir el chat y "Nueva
// conversación" borra la fila.
//
// Robustez: si la tabla aún no existe en el entorno (deploy antes del
// `prisma db push`), las funciones degradan a no-op con warn — el chat sigue
// funcionando, solo que sin memoria.

import type { UIMessage } from "ai";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

/**
 * Cap de mensajes persistidos. Evita que el JSON crezca sin límite (los tool
 * results de execute_sql pueden ser grandes). 60 mensajes ≈ varias sesiones
 * de trabajo; el recorte tira los más antiguos.
 */
export const CHAT_THREAD_MAX_MESSAGES = 60;

export async function loadChatThread(userId: string): Promise<UIMessage[]> {
  try {
    const thread = await prisma.chatThread.findUnique({
      where: { userId },
      select: { messages: true },
    });
    if (!thread || !Array.isArray(thread.messages)) return [];
    return thread.messages as unknown as UIMessage[];
  } catch (err) {
    log.warn("chat-thread", `load falló (¿tabla sin crear?): ${String(err).slice(0, 200)}`);
    return [];
  }
}

export async function saveChatThread(
  userId: string,
  messages: UIMessage[]
): Promise<void> {
  try {
    const trimmed = messages.slice(-CHAT_THREAD_MAX_MESSAGES);
    const payload = JSON.parse(JSON.stringify(trimmed));
    await prisma.chatThread.upsert({
      where: { userId },
      create: { userId, messages: payload },
      update: { messages: payload },
    });
  } catch (err) {
    log.warn("chat-thread", `save falló (¿tabla sin crear?): ${String(err).slice(0, 200)}`);
  }
}

export async function clearChatThread(userId: string): Promise<void> {
  try {
    await prisma.chatThread.deleteMany({ where: { userId } });
  } catch (err) {
    log.warn("chat-thread", `clear falló (¿tabla sin crear?): ${String(err).slice(0, 200)}`);
  }
}
