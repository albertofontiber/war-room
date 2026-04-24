import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/proposals?status=PENDING&finderId=...
 *
 * Lista de propuestas hechas por los finders. Por defecto solo PENDING.
 * Solo admins. Incluye la identidad del finder que propuso.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "PENDING";
  const finderId = url.searchParams.get("finderId");

  const proposals = await prisma.targetProposal.findMany({
    where: {
      ...(status === "ALL" ? {} : { status: status as "PENDING" | "ACCEPTED" | "DUPLICATE" | "OUT_OF_SCOPE" | "REJECTED" }),
      ...(finderId ? { finderId } : {}),
    },
    include: {
      finder: { select: { id: true, name: true, email: true } },
      empresa: { select: { id: true, nombre: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(proposals);
}
