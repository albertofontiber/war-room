import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const grupos = await prisma.grupo.findMany({
    orderBy: { nombre: "asc" },
    include: {
      empresas: {
        orderBy: { nombre: "asc" },
        select: {
          id: true,
          nombre: true,
          localidad: true,
          provincia: true,
          sector: true,
          empleados: true,
          web: true,
          financieros: {
            orderBy: { anio: "desc" },
            take: 1,
            select: { anio: true, ingresos: true, ebitda: true, margenBruto: true },
          },
          crmEstado: { select: { dealStage: true } },
          bormeAlertas: {
            orderBy: { fecha: "desc" },
            take: 3,
            select: {
              id: true,
              fecha: true,
              tipoActo: true,
              grupoInferido: { select: { nombre: true } },
            },
          },
        },
      },
    },
  });

  // Agregar financieros por grupo
  const result = grupos.map((g) => {
    let totalIngresos = 0;
    let totalEbitda = 0;
    let totalEmpleados = 0;
    let hasIngresos = false;
    let hasEbitda = false;

    for (const e of g.empresas) {
      const f = e.financieros[0];
      if (f?.ingresos) { totalIngresos += f.ingresos; hasIngresos = true; }
      if (f?.ebitda) { totalEbitda += f.ebitda; hasEbitda = true; }
      if (e.empleados) totalEmpleados += e.empleados;
    }

    return {
      id: g.id,
      nombre: g.nombre,
      tipo: g.tipo,
      notas: g.notas,
      empresasCount: g.empresas.length,
      totalIngresos: hasIngresos ? totalIngresos : null,
      totalEbitda: hasEbitda ? totalEbitda : null,
      ebitdaPct: hasIngresos && hasEbitda && totalIngresos > 0
        ? (totalEbitda / totalIngresos) * 100
        : null,
      totalEmpleados: totalEmpleados > 0 ? totalEmpleados : null,
      empresas: g.empresas.map((e) => {
        const f = e.financieros[0] ?? null;
        return {
          id: e.id,
          nombre: e.nombre,
          localidad: e.localidad,
          provincia: e.provincia,
          sector: e.sector,
          empleados: e.empleados,
          web: e.web,
          financiero: f ? {
            anio: f.anio,
            ingresos: f.ingresos,
            ebitda: f.ebitda,
            ebitdaPct: f.ingresos && f.ebitda ? (f.ebitda / f.ingresos) * 100 : null,
            margenBruto: f.margenBruto,
          } : null,
          crmStage: e.crmEstado?.dealStage ?? null,
          bormeAlertas: e.bormeAlertas,
        };
      }),
    };
  });

  return NextResponse.json(result);
  } catch (error) {
    log.error("api/grupos/detalle GET", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
