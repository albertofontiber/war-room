import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";
import { authOptions } from "@/lib/auth";
import { PerimetroPatchSchema, zodError } from "@/lib/validation";
import { auditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/user-from-session";
import { log } from "@/lib/logger";

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Solo admins. Antes solo verificaba que hubiera sesión.
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await getCurrentUser();

    const id = parseInt(params.id, 10);
    if (isNaN(id))
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const parsed = PerimetroPatchSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);

    const prev = await prisma.empresa.findUnique({
      where: { id },
      select: { enPerimetro: true },
    });
    const empresa = await prisma.empresa.update({
      where: { id },
      data: {
        enPerimetro: parsed.data.enPerimetro,
        enPerimetroAt: new Date(),
      },
      select: { id: true, enPerimetro: true, enPerimetroAt: true },
    });
    if (prev && prev.enPerimetro !== empresa.enPerimetro) {
      void auditLog({
        actorType: "admin",
        actorId: user?.id ?? null,
        action: "update",
        entityType: "empresa",
        entityId: id,
        before: { enPerimetro: prev.enPerimetro },
        after: { enPerimetro: empresa.enPerimetro },
      });
    }

    return NextResponse.json(empresa);
  } catch (error) {
    log.error("api/empresas/[id]/perimetro PATCH", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
