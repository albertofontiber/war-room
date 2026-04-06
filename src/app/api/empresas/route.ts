import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTendencia } from "@/lib/tendencia";

export const dynamic = "force-dynamic";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Deterministic coordinate jitter based on CIF — prevents pins from stacking exactly
// Range: ±0.0004° ≈ ±44m (well within same-city accuracy, eliminates overlap)
function hashInt(str: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}
function getJitter(cif: string, axis: 0 | 1): number {
  const h = hashInt(cif, axis === 0 ? 0x12345678 : 0x87654321);
  return ((h & 0x7fffffff) / 0x7fffffff - 0.5) * 0.0008;
}

export async function GET() {
  try {
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
          select: { id: true, fecha: true, tipoActo: true },
        },
      },
    });

    const cutoff7d = new Date();
    cutoff7d.setDate(cutoff7d.getDate() - 7);
    const PULSE_TIPOS = new Set(["fusion", "adquisicion", "posible_adquisicion"]);

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
          (a) => PULSE_TIPOS.has(a.tipoActo) && new Date(a.fecha) > cutoff7d
        );

        const dealStage = empresa.crmEstado?.dealStage ?? null;

        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [empresa.lng! + getJitter(empresa.cif, 0), empresa.lat! + getJitter(empresa.cif, 1)],
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
  } catch (error) {
    console.error("GET /api/empresas", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
