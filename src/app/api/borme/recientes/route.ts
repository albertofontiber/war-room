/**
 * GET /api/borme/recientes
 * Devuelve todos los actos BORME de los últimos 90 días (todos los tipos),
 * enriquecidos con datos de empresa para filtrado client-side.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const desde = new Date();
    desde.setDate(desde.getDate() - 90);

    const alertas = await prisma.bormeAlerta.findMany({
      where: { fecha: { gte: desde } },
      orderBy: { fecha: "desc" },
      include: {
        empresa: {
          select: {
            id: true,
            nombre: true,
            cif: true,
            web: true,
            grupoId: true,
            enPerimetro: true,
            ccaa: true,
            provincia: true,
            sector: true,
            financieros: {
              orderBy: { anio: "desc" },
              take: 1,
              select: { anio: true, ingresos: true },
            },
          },
        },
        grupoInferido: { select: { id: true, nombre: true } },
      },
    });

    const items = alertas.map((a) => ({
      id: a.id,
      fecha: a.fecha.toISOString(),
      tipoActo: a.tipoActo,
      descripcion: a.descripcion,
      urlBorme: a.urlBorme,
      grupoNombre: a.grupoInferido?.nombre ?? null,
      empresa: {
        id: a.empresa.id,
        nombre: a.empresa.nombre,
        cif: a.empresa.cif,
        web: a.empresa.web,
        grupoId: a.empresa.grupoId,
        enPerimetro: a.empresa.enPerimetro,
        ccaa: a.empresa.ccaa,
        provincia: a.empresa.provincia,
        sector: a.empresa.sector,
        ingresos: a.empresa.financieros[0]?.ingresos ?? null,
        anioFinanciero: a.empresa.financieros[0]?.anio ?? null,
      },
    }));

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    console.error("[borme/recientes] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
