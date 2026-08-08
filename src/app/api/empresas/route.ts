import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcTendencia } from "@/lib/tendencia";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { log } from "@/lib/logger";

// La respuesta es la misma para cualquier admin autenticado pero el universo
// se muta desde la UI (CRM, perímetro, BORME nocturno). El Cache-Control
// se retiró 2026-05-15 — la cache HTTP escondía cambios recientes; la
// invalidación va por el bus `wr:data-changed`.

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

    const cutoff7d = new Date();
    cutoff7d.setDate(cutoff7d.getDate() - 7);
    const PULSE_TIPOS = ["fusion", "adquisicion", "posible_adquisicion"];

    const empresas = await prisma.empresa.findMany({
      where: { esAnonima: false },  // leads anónimos sólo aparecen en /pipeline
      include: {
        grupo: { select: { id: true, nombre: true } },
        // Solo los 2 últimos años: el primero alimenta `latestFin` y los dos
        // juntos `calcTendencia`. Antes traíamos todos (~3-5 por empresa).
        financieros: {
          orderBy: { anio: "desc" },
          take: 2,
          select: { anio: true, ingresos: true, margenBruto: true, ebitda: true },
        },
        crmEstado: {
          select: { dealStage: true },
        },
        // Solo necesitamos saber si HAY alguna alerta reciente de M&A — no la
        // lista entera. Hacemos un take:1 con where filtrado.
        bormeAlertas: {
          where: { fecha: { gte: cutoff7d }, tipoActo: { in: PULSE_TIPOS } },
          take: 1,
          select: { id: true },
        },
        _count: {
          select: {
            tareas: { where: { completada: false } },
            // Count total de alertas BORME (todos los tipos, sin filtro de
            // fecha) para `bormeAlertasCount` que se muestra en el UI.
            bormeAlertas: true,
          },
        },
      },
    });

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

        const bormeAlertasCount = empresa._count.bormeAlertas;
        const hasBormeReciente = empresa.bormeAlertas.length > 0;

        const dealStage = empresa.crmEstado?.dealStage ?? null;
        const tareasPendientesCount = empresa._count.tareas;

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
            anioFinanciero: latestFin?.anio ?? null,
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
            // CRM — tareas pendientes
            tareasPendientesCount,
            // Enrichment
            logoUrl: empresa.logoUrl,
            web: empresa.web,
            grupoId: empresa.grupoId,
            grupoNombre: empresa.grupo?.nombre ?? null,
            cepreven: empresa.cepreven,
            aerme: empresa.aerme,
            habilitaciones: empresa.habilitaciones,
            ripci: empresa.ripci,
            score: empresa.score,
            // Tendencia ingresos
            tendencia: tendenciaIngresos?.direccion ?? "flat",
            variacionPct: tendenciaIngresos?.variacionPct ?? null,
          },
        };
      });

    // Sin Cache-Control: las empresas se mutan desde la UI (edición de
    // ficha, cambio de stage/owner, perímetro, lead anónimo, BORME nocturno).
    // Cualquier max-age esconde cambios recientes. Invalidación correcta
    // por el bus `wr:data-changed` con resource="empresa".
    return NextResponse.json({ type: "FeatureCollection", features });
  } catch (error) {
    log.error("api/empresas GET", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
