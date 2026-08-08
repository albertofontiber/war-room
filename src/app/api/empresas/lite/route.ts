import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { log } from "@/lib/logger";

// Endpoint "lite" — devuelve solo los campos que necesitan mapa, sidebar,
// filtros y búsqueda del Navbar. La tabla y los paneles cargan el endpoint
// completo (`/api/empresas`) bajo demanda. Best practice BFF/view-shaped API:
// el coste real de un payload no son los bytes en red sino el JSON.parse y
// los re-renders en el cliente — devolver 17 campos en lugar de 28 reduce
// ~30% el coste de parse y elimina los URLs largos (logoUrl/web).
//
// Campos omitidos vs `/api/empresas`:
//   localidad, empleados, logoUrl, web, score, margenBruto (raw),
//   tendencia, variacionPct, tareasPendientesCount, bormeAlertasCount.
// Esos solo los pinta la tabla → se cargan al abrir vista=tabla.

import { calcTendencia } from "@/lib/tendencia";

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
      where: { esAnonima: false },
      select: {
        id: true,
        cif: true,
        nombre: true,
        provincia: true,
        ccaa: true,
        sector: true,
        lat: true,
        lng: true,
        enPerimetro: true,
        cepreven: true,
        aerme: true,
        habilitaciones: true,
        ripci: true,
        grupoId: true,
        grupo: { select: { nombre: true } },
        financieros: {
          orderBy: { anio: "desc" },
          take: 2,
          select: { anio: true, ingresos: true, margenBruto: true, ebitda: true },
        },
        crmEstado: { select: { dealStage: true } },
        bormeAlertas: {
          where: { fecha: { gte: cutoff7d }, tipoActo: { in: PULSE_TIPOS } },
          take: 1,
          select: { id: true },
        },
      },
    });

    const features = empresas
      .filter((e) => e.lat !== null && e.lng !== null)
      .map((empresa) => {
        const latestFin = empresa.financieros[0] ?? null;
        const ingresos = latestFin?.ingresos ?? null;
        const margenBruto = latestFin?.margenBruto ?? null;
        const ebitda = latestFin?.ebitda ?? null;
        const margenBrutoPct =
          ingresos && margenBruto ? (margenBruto / ingresos) * 100 : null;
        const ebitdaPct =
          ingresos && ebitda ? (ebitda / ingresos) * 100 : null;

        // Tendencia se omite en lite (la tabla la pinta como flecha; el mapa
        // no la usa). Si en el futuro la queremos en sidebar, añadirla aquí.
        const tendencia = calcTendencia(empresa.financieros, "ingresos");

        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [
              empresa.lng! + getJitter(empresa.cif, 0),
              empresa.lat! + getJitter(empresa.cif, 1),
            ],
          },
          properties: {
            id: empresa.id,
            cif: empresa.cif,
            nombre: empresa.nombre,
            provincia: empresa.provincia,
            ccaa: empresa.ccaa,
            sector: empresa.sector,
            dealStage: empresa.crmEstado?.dealStage ?? null,
            // Financieros para filtros y sizeMetric del mapa
            anioFinanciero: latestFin?.anio ?? null,
            ingresos,
            ebitda,
            margenBrutoPct,
            ebitdaPct,
            enPerimetro: empresa.enPerimetro,
            cepreven: empresa.cepreven,
            aerme: empresa.aerme,
            habilitaciones: empresa.habilitaciones,
            ripci: empresa.ripci,
            hasBormeReciente: empresa.bormeAlertas.length > 0,
            grupoId: empresa.grupoId,
            grupoNombre: empresa.grupo?.nombre ?? null,
            // Tendencia mínima — el mapa no la usa pero el sidebar
            // muestra "↑/↓" en algunos sitios; mantenerla evita romper.
            tendencia: tendencia?.direccion ?? "flat",
          },
        };
      });

    // Sin Cache-Control: ver `api/empresas/route.ts` — las empresas mutan
    // desde la UI, la cache HTTP escondía cambios recientes. Invalidación
    // por bus `wr:data-changed`.
    return NextResponse.json({ type: "FeatureCollection", features });
  } catch (error) {
    log.error("api/empresas/lite GET", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
