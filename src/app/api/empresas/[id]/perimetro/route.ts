import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";
import { authOptions } from "@/lib/auth";
import { PerimetroPatchSchema, zodError } from "@/lib/validation";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = parseInt(params.id, 10);
    if (isNaN(id))
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const parsed = PerimetroPatchSchema.safeParse(await req.json());
    if (!parsed.success) return zodError(parsed.error);

    const empresa = await prisma.empresa.update({
      where: { id },
      data: {
        enPerimetro: parsed.data.enPerimetro,
        enPerimetroAt: new Date(),
      },
      select: { id: true, enPerimetro: true, enPerimetroAt: true },
    });

    return NextResponse.json(empresa);
  } catch (error) {
    console.error("PATCH /api/empresas/[id]/perimetro", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
