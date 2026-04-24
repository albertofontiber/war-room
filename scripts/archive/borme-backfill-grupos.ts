/**
 * borme-backfill-grupos.ts
 *
 * Re-clasifica todas las BormeAlertas existentes con el clasificador mejorado
 * y asigna grupoId a empresas cuando se detecta una señal conocida.
 *
 * Uso:
 *   npx ts-node --project tsconfig.scripts.json scripts/borme-backfill-grupos.ts
 *
 * Idempotente — se puede ejecutar varias veces sin duplicar.
 */

import { PrismaClient } from "@prisma/client";
import { detectarGrupo } from "../src/lib/borme-senales";

const prisma = new PrismaClient();

// ─── Clasificador (réplica del borme.ts para evitar importar todo el módulo) ─

type TipoActo =
  | "fusion" | "adquisicion" | "cambio_denominacion"
  | "nombramiento_grupo" | "nombramiento" | "disolucion" | "otros";

function classify(texto: string): {
  tipoActo: TipoActo;
  grupoNombre: string | null;
  personaDetectada: string | null;
} {
  const t = texto.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (/FUSION|ABSORCION|ESCISION/.test(t)) {
    return { tipoActo: "fusion", grupoNombre: null, personaDetectada: null };
  }
  if (/SOCIO.UNICO|UNIPERSONAL|COMPRAVENTA|CESION.*PARTICIPACION|ADQUISICION/.test(t)) {
    const d = detectarGrupo(texto);
    return { tipoActo: "adquisicion", grupoNombre: d?.grupoNombre ?? null, personaDetectada: d?.personaDetectada ?? null };
  }
  if (/DENOMINACION|DENOMINACIÓ/.test(t)) {
    const d = detectarGrupo(texto);
    return { tipoActo: "cambio_denominacion", grupoNombre: d?.grupoNombre ?? null, personaDetectada: null };
  }
  if (/DISOLUCION|LIQUIDACION|EXTINCION|CANCELACION|BAJA DEFINITIVA/.test(t)) {
    return { tipoActo: "disolucion", grupoNombre: null, personaDetectada: null };
  }
  if (/NOMBRAMIENTO|NOMBRAMIENTOS|CESES|DIMISIONES|REVOCACION|APODERADO|ADMINISTRADOR/.test(t)) {
    const d = detectarGrupo(texto);
    if (d) return { tipoActo: "nombramiento_grupo", grupoNombre: d.grupoNombre, personaDetectada: d.personaDetectada };
    return { tipoActo: "nombramiento", grupoNombre: null, personaDetectada: null };
  }
  const d = detectarGrupo(texto);
  return { tipoActo: "otros", grupoNombre: d?.grupoNombre ?? null, personaDetectada: d?.personaDetectada ?? null };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== BORME backfill: re-clasificación + asignación de grupos ===\n");

  // Cargar mapa de grupos
  const grupos = await prisma.grupo.findMany({ select: { id: true, nombre: true } });
  const grupoByNombre = new Map(grupos.map((g) => [g.nombre, g.id]));
  console.log(`Grupos en BD: ${grupos.map((g) => g.nombre).join(", ")}\n`);

  // Cargar todas las alertas
  const alertas = await prisma.bormeAlerta.findMany({
    select: { id: true, descripcion: true, empresaId: true },
    orderBy: { id: "asc" },
  });
  console.log(`Alertas a procesar: ${alertas.length}\n`);

  const contadores = {
    fusion: 0, adquisicion: 0, cambio_denominacion: 0,
    nombramiento_grupo: 0, nombramiento: 0, disolucion: 0, otros: 0,
    gruposAsignados: 0, gruposYaTenian: 0,
  };

  // Procesar en lotes de 100
  const BATCH = 100;
  for (let i = 0; i < alertas.length; i += BATCH) {
    const lote = alertas.slice(i, i + BATCH);
    const updates: Promise<unknown>[] = [];

    for (const alerta of lote) {
      const texto = alerta.descripcion ?? "";
      const { tipoActo, grupoNombre, personaDetectada } = classify(texto);
      contadores[tipoActo]++;

      const grupoInferidoId = grupoNombre ? (grupoByNombre.get(grupoNombre) ?? null) : null;

      // Actualizar la alerta
      updates.push(
        prisma.bormeAlerta.update({
          where: { id: alerta.id },
          data: { tipoActo, grupoInferidoId, personaDetectada: personaDetectada ?? null },
        })
      );

      // Asignar grupo a la empresa si tiene señal y aún no tiene grupo
      if (grupoInferidoId) {
        updates.push(
          prisma.empresa.updateMany({
            where: { id: alerta.empresaId, grupoId: null },
            data: { grupoId: grupoInferidoId },
          }).then((r) => {
            if (r.count > 0) contadores.gruposAsignados++;
            else contadores.gruposYaTenian++;
          })
        );
      }
    }

    await Promise.all(updates);
    process.stdout.write(`\rProcesadas ${Math.min(i + BATCH, alertas.length)}/${alertas.length} alertas...`);
  }

  console.log("\n\n=== Resultados ===");
  console.log(`fusión:                ${contadores.fusion}`);
  console.log(`adquisición:           ${contadores.adquisicion}`);
  console.log(`cambio denominación:   ${contadores.cambio_denominacion}`);
  console.log(`nombramiento_grupo:    ${contadores.nombramiento_grupo}`);
  console.log(`nombramiento:          ${contadores.nombramiento}`);
  console.log(`disolución:            ${contadores.disolucion}`);
  console.log(`otros:                 ${contadores.otros}`);
  console.log(`\nEmpresas con grupo asignado ahora: ${contadores.gruposAsignados}`);
  console.log(`Empresas que ya tenían grupo:       ${contadores.gruposYaTenian}`);

  // Resumen de señales detectadas por grupo
  console.log("\n=== Señales por grupo ===");
  const senalesPorGrupo = await prisma.bormeAlerta.groupBy({
    by: ["grupoInferidoId", "tipoActo"],
    where: { grupoInferidoId: { not: null } },
    _count: { id: true },
    orderBy: { grupoInferidoId: "asc" },
  });

  for (const s of senalesPorGrupo) {
    const g = grupos.find((g) => g.id === s.grupoInferidoId);
    console.log(`  ${g?.nombre ?? "?"} | ${s.tipoActo} | ${s._count.id} alertas`);
  }

  // Empresas re-asignadas a grupos
  const empresasConGrupo = await prisma.empresa.findMany({
    where: { grupoId: { not: null } },
    select: { nombre: true, grupo: { select: { nombre: true } } },
    orderBy: { grupo: { nombre: "asc" } },
  });

  console.log(`\n=== Empresas asignadas a grupos (${empresasConGrupo.length} total) ===`);
  let grupoActual = "";
  for (const e of empresasConGrupo) {
    if (e.grupo!.nombre !== grupoActual) {
      grupoActual = e.grupo!.nombre;
      console.log(`\n[${grupoActual}]`);
    }
    console.log(`  ${e.nombre}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
