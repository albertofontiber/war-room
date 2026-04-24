import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireCurrentUser } from "@/lib/user-from-session";
import { prisma } from "@/lib/prisma";
import { ProposalReviewSchema, zodError } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/proposals/:id — resuelve una propuesta.
 *
 * Body: { status: PENDING|ACCEPTED|DUPLICATE|OUT_OF_SCOPE|REJECTED,
 *         empresaId?, rejectionReason? }
 *
 * - ACCEPTED: el admin puede vincular a una empresa existente con empresaId.
 *   Si no vincula, queda ACCEPTED sin empresa asociada para que el admin la
 *   cree manualmente después (PR posterior añadirá auto-create).
 * - Otros estados cierran la propuesta; `rejectionReason` se guarda como
 *   nota interna (nunca visible al finder).
 *
 * Solo admins (kind=admin).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.kind !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await requireCurrentUser().catch(() => null);
  if (!admin) return NextResponse.json({ error: "Admin user not found" }, { status: 401 });

  const proposalId = parseInt(params.id, 10);
  if (isNaN(proposalId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const parsed = ProposalReviewSchema.safeParse(await req.json());
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const proposal = await prisma.targetProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, finderId: true, status: true },
  });
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.targetProposal.update({
    where: { id: proposalId },
    data: {
      status: body.status,
      empresaId: body.empresaId ?? null,
      rejectionReason: body.rejectionReason ?? null,
      reviewedAt: body.status === "PENDING" ? null : new Date(),
      reviewedBy: body.status === "PENDING" ? null : admin.id,
    },
    include: {
      finder: { select: { id: true, name: true } },
      empresa: { select: { id: true, nombre: true } },
    },
  });
  return NextResponse.json(updated);
}
