/**
 * Rellena la provincia de las empresas dadas de alta desde el RIPCI.
 *
 *   npx tsx scripts/backfill-provincia-ripci.ts <volcado.jsonl>
 *   npx tsx scripts/backfill-provincia-ripci.ts <volcado.jsonl> --apply
 *
 * La tabla de resultados del buscador NO muestra la provincia, solo la
 * comunidad. Pero el volcado se hizo consultando provincia por provincia, así
 * que cada fila sabe de qué consulta salió: la provincia es un dato exacto, no
 * una inferencia.
 *
 * (Se descartó tirar de datoscif o empresia: sirven la ficha por JavaScript,
 * hay que conocer el slug del nombre en vez del CIF, y son proveedores
 * comerciales. No hace falta para esto.)
 */

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import readline from "node:readline";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/**
 * Código INE de provincia -> nombre tal como ya se escribe en la base
 * (en castellano: "Gerona", "Lérida", "Vizcaya", "Orense"…).
 */
const PROVINCIAS: Record<string, string> = {
  "01": "Álava", "02": "Albacete", "03": "Alicante", "04": "Almería",
  "05": "Ávila", "06": "Badajoz", "07": "Baleares", "08": "Barcelona",
  "09": "Burgos", "10": "Cáceres", "11": "Cádiz", "12": "Castellón",
  "13": "Ciudad Real", "14": "Córdoba", "15": "A Coruña", "16": "Cuenca",
  "17": "Gerona", "18": "Granada", "19": "Guadalajara", "20": "Guipúzcoa",
  "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León",
  "25": "Lérida", "26": "La Rioja", "27": "Lugo", "28": "Madrid",
  "29": "Málaga", "30": "Murcia", "31": "Navarra", "32": "Orense",
  "33": "Asturias", "34": "Palencia", "35": "Las Palmas", "36": "Pontevedra",
  "37": "Salamanca", "38": "Santa Cruz de Tenerife", "39": "Cantabria",
  "40": "Segovia", "41": "Sevilla", "42": "Soria", "43": "Tarragona",
  "44": "Teruel", "45": "Toledo", "46": "Valencia", "47": "Valladolid",
  "48": "Vizcaya", "49": "Zamora", "50": "Zaragoza", "51": "Ceuta",
  "52": "Melilla",
};

async function main() {
  // Cuántas veces sale cada empresa en cada provincia: unas pocas están
  // inscritas en varias y se les asigna aquella en la que tienen más registros.
  const conteo = new Map<string, Map<string, number>>();

  const rl = readline.createInterface({
    input: fs.createReadStream(process.argv[2], "utf8"),
    crlfDelay: Infinity,
  });
  for await (const linea of rl) {
    if (!linea.trim()) continue;
    const f = JSON.parse(linea) as { nif: string; bucket: string };
    const codigo = f.bucket.split("-")[1];
    if (!PROVINCIAS[codigo]) continue;
    const porProv = conteo.get(f.nif) ?? new Map<string, number>();
    porProv.set(codigo, (porProv.get(codigo) ?? 0) + 1);
    conteo.set(f.nif, porProv);
  }

  const empresas = await prisma.empresa.findMany({
    where: { fuente: "ripci" },
    select: { id: true, cif: true, nombre: true, provincia: true },
  });

  const cambios: { id: number; nombre: string; provincia: string }[] = [];
  const sinDato: string[] = [];

  for (const e of empresas) {
    const porProv = conteo.get((e.cif ?? "").toUpperCase());
    if (!porProv?.size) {
      sinDato.push(e.nombre);
      continue;
    }
    const [codigo] = [...porProv.entries()].sort((a, b) => b[1] - a[1])[0];
    const provincia = PROVINCIAS[codigo];
    if (e.provincia !== provincia) cambios.push({ id: e.id, nombre: e.nombre, provincia });
  }

  console.log(`Empresas dadas de alta desde el RIPCI: ${empresas.length}`);
  console.log(`  con provincia a rellenar : ${cambios.length}`);
  console.log(`  sin dato de provincia    : ${sinDato.length}`);

  const reparto: Record<string, number> = {};
  for (const c of cambios) reparto[c.provincia] = (reparto[c.provincia] ?? 0) + 1;
  console.log(
    "\nreparto:",
    Object.entries(reparto).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([p, n]) => `${p} ${n}`).join(" · ")
  );

  if (!APPLY) {
    console.log("\nSimulación: no se ha escrito nada.");
    return;
  }

  const TANDA = 200;
  for (let i = 0; i < cambios.length; i += TANDA) {
    await prisma.$transaction(
      cambios.slice(i, i + TANDA).map((c) =>
        prisma.empresa.update({ where: { id: c.id }, data: { provincia: c.provincia } })
      )
    );
  }
  console.log(`\nHecho: ${cambios.length} provincias rellenadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
