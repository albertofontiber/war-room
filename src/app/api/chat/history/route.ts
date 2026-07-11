import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/user-from-session";
import { clearChatThread, loadChatThread } from "@/lib/chat-thread";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET    /api/chat/history — UIMessages del hilo activo del admin (para
 *        rehidratar el chat al abrirlo).
 * DELETE /api/chat/history — borra el hilo ("Nueva conversación").
 *
 * Solo admins, igual que /api/chat.
 */
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") return null;
  return getCurrentUser();
}

export async function GET() {
  try {
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const messages = await loadChatThread(user.id);
    return NextResponse.json({ messages });
  } catch (err) {
    log.error("api/chat/history GET", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await requireAdmin();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await clearChatThread(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("api/chat/history DELETE", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
