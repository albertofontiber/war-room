/**
 * migrate-actividades-a-tareas-y-notas.ts
 *
 * Migración one-shot que fusiona el modelo Actividad en Tarea + Nota.
 *
 * Mapping:
 *   Actividad.tipo='nota'    → Nota (contenido = texto, createdAt = fecha)
 *   Actividad.tipo='llamada' → Tarea (tipo='llamada',          completada=true)
 *   Actividad.tipo='email'   → Tarea (tipo='email',            completada=true)
 *   Actividad.tipo='reunion' → Tarea (tipo='reunion_presencial', completada=true)
 *   otros                    → Tarea (tipo='otra',             completada=true)
 *
 * Para tareas migradas:
 *   - titulo  = etiqueta legible del tipo (ej. "Llamada")
 *   - resultado = actividad.texto (es lo que pasó)
 *   - fechaLimite = actividad.fecha
 *   - completadaAt = actividad.fecha
 *   - autor / autorFinder → preservados
 *
 * Tras migrar todos los registros, vacía la tabla Actividad. El siguiente
 * `prisma db push` (sobre el schema sin modelo Actividad) drop la tabla.
 *
 * Uso:
 *   npx tsx scripts/migrate-actividades-a-tareas-y-notas.ts          # dry-run
 *   APPLY=1 npx tsx scripts/migrate-actividades-a-tareas-y-notas.ts  # ejecuta
 *
 * Es idempotente: si la tabla Actividad no existe (ya dropeada) o está vacía,
 * sale sin hacer nada.
 *
 * Implementación: usa SQL crudo ($queryRaw / $executeRaw) para no depender del
 * Prisma Client tipado — el schema.prisma ya no declara `Actividad` y el cliente
 * regenerado no expone `prisma.actividad`. La tabla `Actividad` sigue existiendo
 * físicamente en BD hasta que `prisma db push` la dropee.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TIPO_LABEL: Record<string, string> = {
  llamada: "Llamada",
  email: "Email",
  reunion: "Reunión",
  otra: "Otra",
};

const TIPO_MAP: Record<string, string> = {
  llamada: "llamada",
  email: "email",
  reunion: "reunion_presencial",
};

type ActividadRow = {
  id: number;
  empresaId: number;
  tipo: string;
  texto: string | null;
  autorId: string | null;
  autorFinderId: string | null;
  fecha: Date;
  sincronizadoAt: Date;
};

async function main() {
  const apply = process.env.APPLY === "1";

  // 0. Asegura la columna `Tarea.resultado` antes de cualquier insert.
  // El cliente Prisma ya está regenerado con el campo en el schema, pero la
  // columna física no se crea hasta `prisma db push`. Como el script INSERTA
  // con resultado, la añadimos aquí (idempotente — IF NOT EXISTS).
  if (apply) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "resultado" TEXT`
    );
    console.log("✓ Columna Tarea.resultado garantizada (ALTER IF NOT EXISTS).");
  }

  // 1. ¿Existe la tabla Actividad en esta BD?
  const tableExists = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'Actividad'
    ) AS "exists"
  `;
  if (!tableExists[0]?.exists) {
    console.log("La tabla Actividad ya no existe — nada que migrar.");
    return;
  }

  // 2. Leer todas las Actividad por SQL.
  const actividades = await prisma.$queryRaw<ActividadRow[]>`
    SELECT id, "empresaId", tipo, texto, "autorId", "autorFinderId", fecha, "sincronizadoAt"
    FROM "Actividad"
    ORDER BY fecha ASC
  `;

  if (actividades.length === 0) {
    console.log("Tabla Actividad vacía. Nada que migrar.");
    return;
  }

  console.log(`Encontradas ${actividades.length} actividades. ${apply ? "EJECUTANDO" : "Dry-run"}.\n`);

  let toNotas = 0;
  let toTareas = 0;
  const tipoCount: Record<string, number> = {};
  for (const a of actividades) {
    tipoCount[a.tipo] = (tipoCount[a.tipo] ?? 0) + 1;
    if (a.tipo === "nota") toNotas++;
    else toTareas++;
  }

  console.log(`Plan:`);
  console.log(`  → Notas:  ${toNotas}`);
  console.log(`  → Tareas: ${toTareas}`);
  console.log(`Tipos origen: ${JSON.stringify(tipoCount)}`);

  if (!apply) {
    console.log("\nDry-run completo. Ejecuta con APPLY=1 para aplicar cambios.");
    return;
  }

  // Transacción atómica: o se inserta todo + se vacía Actividad, o nada.
  // Si falla un insert (red, validación, etc.) la BD queda intacta y se puede
  // re-ejecutar el script sin riesgo de duplicados.
  await prisma.$transaction(
    async (tx) => {
      for (const a of actividades) {
        if (a.tipo === "nota") {
          await tx.nota.create({
            data: {
              empresaId: a.empresaId,
              contenido: a.texto ?? "(sin contenido)",
              autorId: a.autorId,
              autorFinderId: a.autorFinderId,
              visibleAFinder: false,
              createdAt: a.fecha,
              updatedAt: a.sincronizadoAt,
            },
          });
        } else {
          const tipoNuevo = TIPO_MAP[a.tipo] ?? "otra";
          const titulo = TIPO_LABEL[a.tipo] ?? "Otra";
          await tx.tarea.create({
            data: {
              empresaId: a.empresaId,
              tipo: tipoNuevo,
              titulo,
              descripcion: null,
              resultado: a.texto,
              fechaLimite: a.fecha,
              completada: true,
              completadaAt: a.fecha,
              autorId: a.autorId,
              autorFinderId: a.autorFinderId,
              asignadoId: null,
              asignadoFinderId: null,
              createdAt: a.sincronizadoAt,
            },
          });
        }
      }
      const deleted = await tx.$executeRaw`DELETE FROM "Actividad"`;
      console.log(`✓ Vaciada tabla Actividad (${deleted} filas).`);
    },
    { timeout: 120_000, maxWait: 10_000 }
  );

  console.log(`\nMigración completada. Próximo paso: \`npx prisma db push\` para dropear la tabla.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
