/** Lote revisado de instaladoras/aplicadoras. Simula por defecto; --apply escribe. */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, Prisma } from "@prisma/client";
import { FilaPasivaSchema, planificarPasiva } from "../src/lib/pasiva-import";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const ruta = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");

async function main() {
  if (!ruta) throw new Error("Uso: import-pasiva.ts <lote.json> [--apply]");
  const lote = JSON.parse(fs.readFileSync(path.resolve(ruta), "utf8"));
  const filas = FilaPasivaSchema.array().parse(lote.empresas);
  const ahora = new Date();
  const resumen = await prisma.$transaction(async (tx) => {
    // Serializa lotes simultáneos y revalida la identidad dentro de la transacción.
    if (apply) await tx.$executeRaw`SELECT pg_advisory_xact_lock(23102026, 1)`;
    else await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const empresas = await tx.empresa.findMany({ select: {
      id: true, cif: true, nombre: true, web: true, esAnonima: true,
      direccion: true, codigoPostal: true, localidad: true, provincia: true, ccaa: true, lat: true, lng: true,
      proteccionPasiva: true, pasivaServicios: true, pasivaEvidencias: true, pasivaRevisadaAt: true,
    } });
    const plan = planificarPasiva(filas, empresas);
    const informe = plan.map((p) => ({ cif: p.fila.cif, nombre: p.fila.nombre, accion: p.accion, ...("motivo" in p ? { motivo: p.motivo } : { id: p.existente?.id }) }));
    console.log(JSON.stringify({ modo: apply ? "APLICAR" : "SIMULACIÓN", informe }, null, 2));
    if (!apply) return informe;
    if (plan.some((p) => p.accion === "revisar")) throw new Error("El lote tiene identidades pendientes: no se aplica ninguna fila");
    for (const p of plan) {
      if (p.accion === "revisar" || p.accion === "sin_cambios") continue;
      const cambios = { ...p.cambios, pasivaEvidencias: p.cambios.pasivaEvidencias as Prisma.InputJsonValue };
      const empresa = p.accion === "alta"
        ? await tx.empresa.create({ data: {
            cif: p.fila.cif, nombre: p.fila.nombre, web: p.fila.web,
            descripcion: p.fila.descripcion,
            localidad: p.fila.localidad, provincia: p.fila.provincia, ccaa: p.fila.ccaa,
            direccion: p.fila.direccion, codigoPostal: p.fila.codigoPostal,
            lat: p.fila.lat, lng: p.fila.lng,
            sector: "PCI", fuente: "investigacion_pasiva_202610", enPerimetro: false,
            ...cambios,
          } })
        : await tx.empresa.update({ where: { id: p.existente!.id }, data: cambios });
      // Auditoría atómica: incluye lote e identidad, sin tocar operativa CRM.
      await tx.auditLog.create({ data: {
        actorType: "system", action: p.accion === "alta" ? "create" : "update",
        entityType: "empresa", entityId: String(empresa.id),
        before: p.existente ? JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(p.cambios).map((key) => [key, p.existente![key as keyof typeof p.existente] ?? null])))) : Prisma.JsonNull,
        after: JSON.parse(JSON.stringify(cambios)),
        metadata: { lote: path.basename(ruta!), identidadUrl: p.fila.identidadUrl, identidadMetodo: p.fila.identidadMetodo, ...(p.fila.dominioCompartidoValidado ? { dominioCompartidoValidado: p.fila.dominioCompartidoValidado } : {}), aplicadoEn: ahora.toISOString() },
      } });
    }
    return informe;
  }, { timeout: 120000, maxWait: 30000 });
  console.log(JSON.stringify({ resumen: resumen.reduce<Record<string, number>>((r, e) => ({ ...r, [e.accion]: (r[e.accion] ?? 0) + 1 }), {}) }));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
