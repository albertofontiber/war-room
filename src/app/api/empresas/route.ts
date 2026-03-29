import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTendencia } from "@/lib/tendencia";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const empresas = await prisma.empresa.findMany({
    include: {
      grupo: { select: { id: true, nombre: true } },
      financieros: { orderBy: { anio: "desc" } },
      crmEstado: {
        select: { dealStage: true, pipedriveOrgId: true },
      },
      bormeAlertas: {
        select: { id: true, fecha: true },
      },
    },
  });

  const cutoff24m = new Date();
  cutoff24m.setMonth(cutoff24m.getMonth() - 24);

  const features = empresas
    .filter((e) => e.lat !== null && e.lng !== null)
    .map((empresa) => {
      // Latest financial year
      const latestFin = empresa.financieros[0] ?? null;

      const ingresos = latestFin?.ingresos ?? null;
      const margenBruto = latestFin?.margenBruto ?? null;
      const ebitda = latestFin?.ebitda ?? null;
      const margenBrutoPct =
        ingresos && margenBruto ? (margenBruto / ingresos) * 100 : null;
      const ebitdaPct =
        ingresos && ebitda ? (ebitda / ingresos) * 100 : null;

      const tendenciaIngresos = calcTendencia(empresa.financieros, "ingresos");

      const bormeAlertasCount = empresa.bormeAlertas.length;
      const hasBormeReciente = empresa.bormeAlertas.some(
        (a) => new Date(a.fecha) > cutoff24m
      );

      const dealStage = empresa.crmEstado?.dealStage ?? null;

      return {
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [empresa.lng!, empresa.lat!],
        },
        properties: {
          id: empresa.id,
          cif: empresa.cif,
          nombre: empresa.nombre,
          localidad: empresa.localidad,
          provincia: empresa.provincia,
          ccaa: empresa.ccaa,
          sector: empresa.sector,
          dealStage,
          // Financieros (último año disponible)
          ingresos,
          margenBruto,
          margenBrutoPct,
          ebitda,
          ebitdaPct,
          empleados: empresa.empleados,
          // Perímetro
          enPerimetro: empresa.enPerimetro,
          // BORME
          bormeAlertasCount,
          hasBormeReciente,
          // Enrichment
          logoUrl: empresa.logoUrl,
          web: empresa.web,
          grupoId: empresa.grupoId,
          grupoNombre: empresa.grupo?.nombre ?? null,
          cepreven: empresa.cepreven,
          aerme: empresa.aerme,
          score: empresa.score,
          // Tendencia ingresos
          tendencia: tendenciaIngresos?.direccion ?? "flat",
          variacionPct: tendenciaIngresos?.variacionPct ?? null,
        },
      };
    });

  return NextResponse.json(
    { type: "FeatureCollection", features },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
