/**
 * GET /api/borme/operaciones
 *
 * Devuelve señales operacionales del BORME enriquecidas con:
 *  - efectiveTipo:
 *      "posible_adquisicion"  → nombramiento de persona conocida en empresa NO mapeada al grupo
 *      "nombramiento_interno" → ídem pero empresa ya pertenece al grupo (excluido por defecto)
 *      resto de tipos: igual que tipoActo
 *  - Deduplicación por (empresaId, día): si el mismo día hay adquisición y nombramiento
 *    para la misma empresa, se mantiene solo el acto de mayor prioridad
 *  - Campos de empresa enriquecidos para filtrado client-side
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const TIPOS_OPERACIONALES = [
  "fusion",
  "adquisicion",
  "cambio_denominacion",
  "nombramiento_grupo",
  "nombramiento",
  // Tras la fusión de "Actividad reciente" en esta misma vista, también
  // incluimos disoluciones y otros actos (ceses, dimisiones, depósitos de
  // cuentas, ampliaciones de capital y modificaciones estatutarias que el
  // classifier deja en `otros`).
  "disolucion",
  "otros",
];

// Prioridad para deduplicación cuando un mismo día hay varios actos para la
// misma empresa: se queda el de mayor prioridad. Disolución gana sobre todo
// (la empresa se acaba — es la noticia más fuerte). `otros` es el catch-all
// y queda en último lugar para no eclipsar señales reales.
const TIPO_PRIORITY: Record<string, number> = {
  disolucion: 7,
  fusion: 6,
  adquisicion: 5,
  posible_adquisicion: 4,
  cambio_denominacion: 3,
  nombramiento: 2,
  otros: 1,
};

/** Extrae el nombre del adquirente del texto BORME para casos sin grupo conocido */
function extractAdquirente(descripcion: string | null): string | null {
  if (!descripcion) return null;
  const d = descripcion;

  // "Socio único: NOMBRE SA." / "Socio Unico. NOMBRE"
  const socioMatch = d.match(
    /[Ss]ocio\s+[Úú]nico[:\s.]+([A-ZÁÉÍÓÚÜÑ][^.;()\n]{2,60}?)(?:\.|;|\n|$)/
  );
  if (socioMatch) {
    const name = socioMatch[1].trim().replace(/[.,;]+$/, "");
    if (name.length > 2) return name;
  }

  // "Sociedad absorbente: NOMBRE" (fusiones)
  const absoMatch = d.match(
    /[Ss]ociedad\s+absorbente[:\s]+([A-ZÁÉÍÓÚÜÑ][^.;()\n]{2,60}?)(?:\.|;|\n|$)/
  );
  if (absoMatch) {
    const name = absoMatch[1].trim().replace(/[.,;]+$/, "");
    if (name.length > 2) return name;
  }

  // "Unipersonalidad. [Nombre]" — solo si el siguiente token parece un nombre de empresa
  const uniMatch = d.match(
    /[Uu]nipersonalidad[.\s]+([A-ZÁÉÍÓÚÜÑ][^.;()\n]{3,60}?)(?:\.|;|\n|$)/
  );
  if (uniMatch) {
    const candidate = uniMatch[1].trim().replace(/[.,;]+$/, "");
    if (candidate.length > 3 && !/^(Socio|La\s|El\s|Se\s)/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function GET() {
  try {
    // Solo admins. Las señales BORME revelan empresas en M&A activo + CIFs.
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const alertas = await prisma.bormeAlerta.findMany({
      where: { tipoActo: { in: TIPOS_OPERACIONALES } },
      orderBy: { fecha: "desc" },
      include: {
        empresa: {
          select: {
            id: true,
            cif: true,
            nombre: true,
            web: true,
            grupoId: true,
            enPerimetro: true,
            ccaa: true,
            provincia: true,
            sector: true,
            financieros: {
              orderBy: { anio: "desc" },
              take: 1,
              select: { anio: true, ingresos: true, ebitda: true, margenBruto: true },
            },
          },
        },
        grupoInferido: {
          select: { id: true, nombre: true },
        },
      },
    });

    // ── Enriquecer con efectiveTipo y adquirente ────────────────────────────
    const enriched = alertas.map((a) => {
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

      // Determinar adquirente
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

      // Calcular efectiveTipo
      let efectiveTipo = a.tipoActo;
      if (a.tipoActo === "nombramiento_grupo" && adquirente.tipo === "grupo_conocido") {
        const yaEnGrupo = a.empresa.grupoId === adquirente.grupoId;
        efectiveTipo = yaEnGrupo ? "nombramiento" : "posible_adquisicion";
      }

      return {
        id: a.id,
        fecha: a.fecha.toISOString(),
        tipoActo: a.tipoActo,
        efectiveTipo,
        descripcion: a.descripcion,
        urlBorme: a.urlBorme,
        leido: a.leido,
        empresa: {
          id: a.empresa.id,
          cif: a.empresa.cif,
          nombre: a.empresa.nombre,
          web: a.empresa.web,
          grupoId: a.empresa.grupoId,
          enPerimetro: a.empresa.enPerimetro,
          ccaa: a.empresa.ccaa,
          provincia: a.empresa.provincia,
          sector: a.empresa.sector,
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

    // ── Deduplicar por (empresaId, día): conservar el tipo de mayor prioridad ─
    const dedupMap = new Map<string, (typeof enriched)[0]>();
    for (const item of enriched) {
      const day = item.fecha.slice(0, 10);
      const key = `${item.empresa.id}-${day}`;
      const existing = dedupMap.get(key);
      if (
        !existing ||
        (TIPO_PRIORITY[item.efectiveTipo] ?? 0) >
          (TIPO_PRIORITY[existing.efectiveTipo] ?? 0)
      ) {
        dedupMap.set(key, item);
      }
    }

    const items = Array.from(dedupMap.values()).sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );

    return NextResponse.json({ items, total: items.length });
  } catch (err) {
    log.error("api/borme/operaciones GET", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
