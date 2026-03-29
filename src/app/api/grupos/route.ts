import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const grupos = await prisma.grupo.findMany({
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
  return NextResponse.json(grupos);
}
