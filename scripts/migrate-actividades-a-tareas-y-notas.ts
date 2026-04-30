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
 *   - titulo  = TAREA_TIPO_LABEL[tipo] (ej. "Llamada")
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
 * Es idempotente: si la tabla Actividad está vacía o no existe, sale sin tocar nada.
 *
 * IMPORTANTE: ejecutar ANTES de `prisma db push` sobre el schema nuevo (sin modelo
 * Actividad). El cliente de Prisma de este script asume que el schema TODAVÍA
 * declara Actividad.
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

async function main() {
  const apply = process.env.APPLY === "1";

  // @ts-expect-error — el modelo Actividad sigue declarado en schema.prisma cuando
  // se ejecuta este script. Tras db:push se borrará. El @ts-expect-error evita que
  // el compilador falle DESPUÉS de la migración cuando ya no exista el modelo.
  const actividades = await prisma.actividad.findMany({
    orderBy: { fecha: "asc" },
  });

  if (actividades.length === 0) {
    console.log("Sin actividades que migrar. Tabla vacía o ya migrada.");
    return;
  }

  console.log(`Encontradas ${actividades.length} actividades. ${apply ? "EJECUTANDO" : "Dry-run"}.\n`);

  let toNotas = 0;
  let toTareas = 0;
  const tipoCount: Record<string, number> = {};

  for (const a of actividades) {
    tipoCount[a.tipo] = (tipoCount[a.tipo] ?? 0) + 1;

    if (a.tipo === "nota") {
      // → Nota
      if (apply) {
        await prisma.nota.create({
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
      }
      toNotas++;
    } else {
      // → Tarea completada
      const tipoNuevo = TIPO_MAP[a.tipo] ?? "otra";
      const titulo = TIPO_LABEL[a.tipo] ?? "Otra";
      if (apply) {
        await prisma.tarea.create({
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
      toTareas++;
    }
  }

  console.log(`Plan:`);
  console.log(`  → Notas:  ${toNotas}`);
  console.log(`  → Tareas: ${toTareas}`);
  console.log(`Tipos origen: ${JSON.stringify(tipoCount)}`);

  if (apply) {
    // @ts-expect-error — ver arriba.
    const { count } = await prisma.actividad.deleteMany({});
    console.log(`\nVaciada tabla Actividad (${count} filas). Próximo paso: \`npm run db:push\`.`);
  } else {
    console.log("\nDry-run completo. Ejecuta con APPLY=1 para aplicar cambios.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
