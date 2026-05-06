/**
 * GET /api/borme/personas-compartidas
 *
 * Detecta personas que aparecen en cargos vigentes de 2+ empresas distintas,
 * consultando directamente la tabla PersonaCargo (Fase 2).
 *
 * Para registros de fuente='borme', hace un lookup secundario en BormeAlerta
 * para recuperar el urlBorme del nombramiento correspondiente.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GRUPOS_SENALES } from "@/lib/borme-senales";
import { bormePersonaToCargoKey } from "@/lib/normalize";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Personas ya conocidas (grupos) — convertidas al formato clave de PersonaCargo (tokens ordenados)
const KNOWN_PERSONS_NORM = new Set(
  GRUPOS_SENALES.flatMap((g) => g.personas)
    .map((p) => bormePersonaToCargoKey(p))
    .filter(Boolean) as string[]
);

interface EmpresaFinanciero {
  ingresos: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
  margenBruto: number | null;
  margenBrutoPct: number | null;
  anioFinanciero: number | null;
}

interface PersonaEnEmpresa extends EmpresaFinanciero {
  empresaId: number;
  empresaNombre: string;
  grupoNombre: string | null;
  grupoId: number | null;
  rol: string | null;
  ultimaFecha: string;
  urlBorme: string | null;
  enPerimetro: boolean;
  ccaa: string | null;
  provincia: string | null;
  sector: string | null;
  web: string | null;
  fuente: string;
  nombreOrig: string;
}

interface PersonaCompartida {
  nombreNorm: string;
  displayName: string;   // nombre en orden natural (preferido: fuente empresia)
  numEmpresas: number;
  ultimaAparicion: string;
  empresas: PersonaEnEmpresa[];
}

export async function GET() {
  try {
    // Solo admins. Cruza personas con cargos en múltiples empresas — info
    // sensible para detectar señales de M&A.
    const session = await getServerSession(authOptions);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Leer todos los PersonaCargo vigentes con datos de empresa
    const cargos = await prisma.personaCargo.findMany({
      where: { vigente: true },
      select: {
        empresaId: true,
        nombreNorm: true,
        nombreOrig: true,
        rol: true,
        fechaDesde: true,
        esJuridica: true,
        fuente: true,
        empresa: {
          select: {
            id: true,
            nombre: true,
            grupoId: true,
            enPerimetro: true,
            ccaa: true,
            provincia: true,
            sector: true,
            web: true,
            grupo: { select: { nombre: true } },
            financieros: {
              orderBy: { anio: "desc" },
              take: 1,
              select: { anio: true, ingresos: true, ebitda: true, margenBruto: true },
            },
          },
        },
      },
    });

    // 2. Agrupar por nombreNorm, excluir personas de grupos conocidos
    type CargoRaw = typeof cargos[number];
    const personaMap = new Map<string, CargoRaw[]>();

    for (const cargo of cargos) {
      if (KNOWN_PERSONS_NORM.has(cargo.nombreNorm)) continue;
      if (!personaMap.has(cargo.nombreNorm)) personaMap.set(cargo.nombreNorm, []);
      personaMap.get(cargo.nombreNorm)!.push(cargo);
    }

    // 3. Filtrar a personas con ≥2 empresas distintas
    const candidatos = new Map<string, CargoRaw[]>();
    for (const [nombreNorm, entries] of Array.from(personaMap.entries())) {
      if (entries.length >= 2) candidatos.set(nombreNorm, entries);
    }

    // 4. Lookup secundario de urlBorme para registros de fuente='borme'
    //    Agrupamos por empresaId para hacer una sola query por empresa
    const bormeEntries = Array.from(candidatos.values())
      .flat()
      .filter((c: CargoRaw) => c.fuente === "borme" && c.fechaDesde !== null);

    const empresaIdsConBorme = Array.from(
      new Set(bormeEntries.map((c: CargoRaw) => c.empresaId))
    );
    const urlBormeMap = new Map<string, string>(); // key: `${empresaId}::${fecha.toISOString()}`

    if (empresaIdsConBorme.length > 0) {
      const alertas = await prisma.bormeAlerta.findMany({
        where: {
          empresaId: { in: empresaIdsConBorme },
          tipoActo: { in: ["nombramiento", "nombramiento_grupo", "otros"] },
          urlBorme: { not: null },
        },
        select: { empresaId: true, fecha: true, urlBorme: true },
      });

      for (const a of alertas) {
        if (!a.urlBorme) continue;
        const key = `${a.empresaId}::${a.fecha.toISOString()}`;
        if (!urlBormeMap.has(key)) urlBormeMap.set(key, a.urlBorme);
      }
    }

    // 5. Construir resultado final
    const results: PersonaCompartida[] = [];

    for (const [nombreNorm, entries] of Array.from(candidatos.entries())) {
      const empresas: PersonaEnEmpresa[] = entries.map((cargo) => {
        const fin = cargo.empresa.financieros[0] ?? null;
        const ingresos = fin?.ingresos ?? null;
        const ebitda = fin?.ebitda ?? null;
        const margenBruto = fin?.margenBruto ?? null;

        let urlBorme: string | null = null;
        if (cargo.fuente === "borme" && cargo.fechaDesde) {
          const key = `${cargo.empresaId}::${cargo.fechaDesde.toISOString()}`;
          urlBorme = urlBormeMap.get(key) ?? null;
        }

        return {
          empresaId: cargo.empresaId,
          empresaNombre: cargo.empresa.nombre,
          grupoNombre: cargo.empresa.grupo?.nombre ?? null,
          grupoId: cargo.empresa.grupoId,
          rol: cargo.rol ?? null,
          ultimaFecha: cargo.fechaDesde?.toISOString() ?? new Date(0).toISOString(),
          urlBorme,
          enPerimetro: cargo.empresa.enPerimetro,
          ccaa: cargo.empresa.ccaa,
          provincia: cargo.empresa.provincia,
          sector: cargo.empresa.sector,
          web: cargo.empresa.web,
          fuente: cargo.fuente,
          nombreOrig: cargo.nombreOrig,
          ingresos,
          ebitda,
          ebitdaPct:
            ingresos && ebitda ? Math.round((ebitda / ingresos) * 1000) / 10 : null,
          margenBruto,
          margenBrutoPct:
            ingresos && margenBruto
              ? Math.round((margenBruto / ingresos) * 1000) / 10
              : null,
          anioFinanciero: fin?.anio ?? null,
        };
      });

      // Ordenar empresas por fecha desc
      empresas.sort(
        (a, b) =>
          new Date(b.ultimaFecha).getTime() - new Date(a.ultimaFecha).getTime()
      );

      // displayName: preferir el nombreOrig de fuente=empresia (más fiable)
      const empresiaEntry = entries.find((e: CargoRaw) => e.fuente === "empresia");
      const displayName = empresiaEntry
        ? empresiaEntry.nombreOrig
        : entries[0].nombreOrig;

      results.push({
        nombreNorm,
        displayName,
        numEmpresas: empresas.length,
        ultimaAparicion: empresas[0].ultimaFecha,
        empresas,
      });
    }

    results.sort(
      (a, b) =>
        b.numEmpresas - a.numEmpresas ||
        new Date(b.ultimaAparicion).getTime() -
          new Date(a.ultimaAparicion).getTime()
    );

    return NextResponse.json({ personas: results, total: results.length });
  } catch (err) {
    log.error("api/borme/personas-compartidas GET", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
