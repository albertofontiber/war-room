import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";
import { authOptions } from "@/lib/auth";
import { calcTendencia, enrichFinancieros } from "@/lib/tendencia";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = parseInt(params.id, 10);
    if (isNaN(id))
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const empresa = await prisma.empresa.findUnique({
    where: { id },
    include: {
      grupo: { select: { id: true, nombre: true, tipo: true } },
      financieros: { orderBy: { anio: "desc" } },
      crmEstado: {
        select: {
          dealStage: true,
          owner: true,
          pipedriveOrgId: true,
          updatedAt: true,
        },
      },
      bormeAlertas: {
        orderBy: { fecha: "desc" },
        take: 20,
        select: {
          id: true,
          fecha: true,
          tipoActo: true,
          grupoInferido: { select: { nombre: true } },
          descripcion: true,
          urlBorme: true,
          leido: true,
        },
      },
      actividades: {
        orderBy: { fecha: "desc" },
        take: 20,
        select: {
          id: true,
          tipo: true,
          texto: true,
          autor: true,
          fecha: true,
        },
      },
    },
  });

  if (!empresa)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Parse servicios JSON
  let servicios: string[] = [];
  try {
    servicios = empresa.servicios ? JSON.parse(empresa.servicios) : [];
  } catch {
    servicios = [];
  }

  const financierosEnriquecidos = enrichFinancieros(empresa.financieros);
  const tendenciaIngresos = calcTendencia(empresa.financieros, "ingresos");
  const tendenciaMargenBruto = calcTendencia(empresa.financieros, "margenBruto");

  return NextResponse.json(
    {
      id: empresa.id,
      cif: empresa.cif,
      nombre: empresa.nombre,
      direccion: empresa.direccion,
      localidad: empresa.localidad,
      provincia: empresa.provincia,
      ccaa: empresa.ccaa,
      lat: empresa.lat,
      lng: empresa.lng,
      sector: empresa.sector,
      servicios,
      empleados: empresa.empleados,
      web: empresa.web,
      linkedin: empresa.linkedin,
      logoUrl: empresa.logoUrl,
      descripcion: empresa.descripcion,
      cepreven: empresa.cepreven,
      aerme: empresa.aerme,
      enPerimetro: empresa.enPerimetro,
      enPerimetroAt: empresa.enPerimetroAt,
      scoreInicial: empresa.scoreInicial,
      score: empresa.score,
      updatedAt: empresa.updatedAt,
      grupo: empresa.grupo,
      financieros: financierosEnriquecidos,
      tendenciaIngresos,
      tendenciaMargenBruto,
      crmEstado: empresa.crmEstado,
      bormeAlertas: empresa.bormeAlertas,
      actividades: empresa.actividades,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
  } catch (error) {
    console.error("GET /api/empresas/[id]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
