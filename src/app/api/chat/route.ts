import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SYSTEM_PROMPT } from "@/lib/chat-schema";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXEC|EXECUTE)\b/i;

function validateSQL(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+$/, "").trim();
  if (!trimmed.toUpperCase().startsWith("SELECT")) return false;
  if (FORBIDDEN.test(trimmed)) return false;
  return true;
}

function addLimit(sql: string): string {
  const trimmed = sql.trim().replace(/;+$/, "");
  if (!/\bLIMIT\b/i.test(trimmed)) {
    return trimmed + " LIMIT 100";
  }
  return trimmed;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  // Solo admins. El chat ejecuta SELECT arbitrario sobre toda la BD vía
  // prisma.$queryRawUnsafe — un finder con sesión activa no debe poder leer
  // CIFs, financieros, password hashes, etc.
  if (!session || session.kind !== "admin") {
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
    model: anthropic("claude-sonnet-4-20250514"),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    stopWhen: stepCountIs(5),
    tools: {
      execute_sql: tool({
        description:
          "Ejecuta una query SQL SELECT contra la base de datos PostgreSQL del War Room. Solo SELECT permitido.",
        inputSchema: z.object({
          query: z
            .string()
            .describe("Query SQL SELECT a ejecutar. Usa comillas dobles para nombres de tablas/columnas con mayúsculas."),
        }),
        execute: async ({ query }: { query: string }) => {
          if (!validateSQL(query)) {
            return { error: "Solo se permiten queries SELECT." };
          }
          const safeQuery = addLimit(query);
          try {
            const rawRows = await prisma.$queryRawUnsafe(safeQuery);
            // Convert BigInt values to Number (Prisma returns BigInt for COUNT, SUM, etc.)
            const rows = JSON.parse(JSON.stringify(rawRows, (_key, value) =>
              typeof value === "bigint" ? Number(value) : value
            ));
            return {
              query: safeQuery,
              rows,
              count: Array.isArray(rows) ? rows.length : 0,
            };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Unknown error";
            return { error: message, query: safeQuery };
          }
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
