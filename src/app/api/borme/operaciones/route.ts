/**
 * GET /api/borme/operaciones
 *
 * Devuelve todas las alertas BORME de tipo operacional:
 * fusion | adquisicion | cambio_denominacion | nombramiento_grupo
 *
 * Enriquecidas con:
 *  - datos financieros del año más reciente de la empresa target
 *  - grupo adquirente (si conocido)
 *  - adquirente extraído del texto (para compradores desconocidos)
 */

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TIPOS_OPERACIONALES = [
  "fusion",
  "adquisicion",
  "cambio_denominacion",
  "nombramiento_grupo",
];

/** Extrae el nombre del adquirente del texto BORME para casos sin grupo conocido */
function extractAdquirente(descripcion: string | null): string | null {
  if (!descripcion) return null;
  const d = descripcion;

  // "Socio único: NOMBRE SA."  /  "Socio Unico. NOMBRE"
  const socioMatch = d.match(/[Ss]ocio\s+[Úú]nico[:\s.]+([A-ZÁÉÍÓÚÜÑ][^.;()\n]{2,60}?)(?:\.|;|\n|$)/);
  if (socioMatch) {
    const name = socioMatch[1].trim().replace(/[.,;]+$/, "");
    if (name.length > 2) return name;
  }

  // "Sociedad absorbente: NOMBRE" (fusiones)
  const absoMatch = d.match(/[Ss]ociedad\s+absorbente[:\s]+([A-ZÁÉÍÓÚÜÑ][^.;()\n]{2,60}?)(?:\.|;|\n|$)/);
  if (absoMatch) {
    const name = absoMatch[1].trim().replace(/[.,;]+$/, "");
    if (name.length > 2) return name;
  }

  // "Unipersonalidad. [Nombre de la entidad como socio único]"
  const uniMatch = d.match(/[Uu]nipersonalidad[.\s]+([A-ZÁÉÍÓÚÜÑ][^.;()\n]{3,60}?)(?:\.|;|\n|$)/);
  if (uniMatch) {
    const candidate = uniMatch[1].trim().replace(/[.,;]+$/, "");
    // Ignore generic words
    if (candidate.length > 3 && !/^(Socio|La\s|El\s|Se\s)/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function GET() {
  try {
    const alertas = await prisma.bormeAlerta.findMany({
      where: { tipoActo: { in: TIPOS_OPERACIONALES } },
      orderBy: { fecha: "desc" },
      include: {
        empresa: {
          select: {
            id: true,
            nombre: true,
            web: true,
            cif: true,
            grupoId: true,
            financieros: {
              orderBy: { anio: "desc" },
              take: 1,
              select: {
                anio: true,
                ingresos: true,
                ebitda: true,
                margenBruto: true,
              },
            },
          },
        },
        grupoInferido: {
          select: { id: true, nombre: true },
        },
      },
    });

    const items = alertas.map((a) => {
      const fin = a.empresa.financieros[0] ?? null;
      const ingresos = fin?.ingresos ?? null;
      const ebitda = fin?.ebitda ?? null;
      const ebitdaPct =
        ingresos && ebitda ? Math.round((ebitda / ingresos) * 1000) / 10 : null;
      const margenBruto = fin?.margenBruto ?? null;
      const margenBrutoPct =
        ingresos && margenBruto
          ? Math.round((margenBruto / ingresos) * 1000) / 10
          : null;

      // Determine acquirer
      let adquirente: {
        tipo: "grupo_conocido" | "empresa_extraida" | "desconocido";
        grupoId?: number;
        grupoNombre?: string;
        empresaNombre?: string;
        personaDetectada?: string | null;
      };

      if (a.grupoInferido) {
        adquirente = {
          tipo: "grupo_conocido",
          grupoId: a.grupoInferido.id,
          grupoNombre: a.grupoInferido.nombre,
          personaDetectada: a.personaDetectada,
        };
      } else {
        const extracted = extractAdquirente(a.descripcion);
        adquirente = extracted
          ? { tipo: "empresa_extraida", empresaNombre: extracted }
          : { tipo: "desconocido" };
      }

      return {
        id: a.id,
        fecha: a.fecha.toISOString(),
        tipoActo: a.tipoActo,
        descripcion: a.descripcion,
        urlBorme: a.urlBorme,
        leido: a.leido,
        empresa: {
          id: a.empresa.id,
          nombre: a.empresa.nombre,
          cif: a.empresa.cif,
          web: a.empresa.web,
          grupoId: a.empresa.grupoId,
          ingresos,
          ebitda,
          ebitdaPct,
          margenBruto,
          margenBrutoPct,
          anioFinanciero: fin?.anio ?? null,
        },
        adquirente,
      };
    });

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    console.error("[borme/operaciones] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
