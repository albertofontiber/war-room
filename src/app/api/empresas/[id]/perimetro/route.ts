import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = parseInt(params.id, 10);
  if (isNaN(id))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();
  const enPerimetro = Boolean(body.enPerimetro);

  const empresa = await prisma.empresa.update({
    where: { id },
    data: {
      enPerimetro,
      enPerimetroAt: new Date(),
    },
    select: { id: true, enPerimetro: true, enPerimetroAt: true },
  });

  return NextResponse.json(empresa);
}
