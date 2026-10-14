import { tool } from "ai";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ACENTOS_DESDE,
  ACENTOS_HASTA,
  fragmento,
  patronInicioPalabra,
  terminosBusqueda,
} from "@/lib/texto-busqueda";

/**
 * buscar_texto — búsqueda de texto libre en todo lo que se escribe en el War
 * Room: notas, tareas, emails, reuniones, notas de finders, BORME, fichas de
 * empresa, contactos y comentarios de cambios de etapa. Sin tildes ni
 * mayúsculas, todos los términos deben aparecer.
 *
 * Cada ámbito es una consulta con la misma forma de fila; las expresiones de
 * columna son literales de este fichero (Prisma.raw seguro) y los términos
 * van siempre como parámetros.
 */

const AMBITOS = [
  "notas",
  "tareas",
  "emails",
  "reuniones",
  "notas_finder",
  "borme",
  "empresas",
  "contactos",
  "crm",
] as const;
type Ambito = (typeof AMBITOS)[number];

type DefAmbito = {
  /** FROM + JOINs. Debe exponer el alias `e` para Empresa. */
  from: string;
  /** Columnas de texto donde se busca. */
  campos: string[];
  id: string;
  fecha: string;
  titulo: string;
  extra: string;
};

const DEF: Record<Ambito, DefAmbito> = {
  notas: {
    from: `"Nota" x JOIN "Empresa" e ON e.id = x."empresaId" LEFT JOIN "User" u ON u.id = x."autorId" LEFT JOIN "Finder" f ON f.id = x."autorFinderId"`,
    campos: [`x.contenido`],
    id: `x.id`,
    fecha: `x."createdAt"`,
    titulo: `'Nota'`,
    extra: `jsonb_build_object('autor', coalesce(u.name, f.name))`,
  },
  tareas: {
    from: `"Tarea" x JOIN "Empresa" e ON e.id = x."empresaId" LEFT JOIN "User" u ON u.id = x."autorId"`,
    campos: [`x.titulo`, `x.descripcion`, `x.resultado`],
    id: `x.id`,
    fecha: `coalesce(x."completadaAt", x."fechaLimite", x."createdAt")`,
    titulo: `x.titulo`,
    extra: `jsonb_build_object('tipo', x.tipo, 'completada', x.completada, 'autor', u.name)`,
  },
  emails: {
    from: `"EmailIngest" x JOIN "Empresa" e ON e.id = x."empresaId"`,
    campos: [`x.subject`, `x.body`],
    id: `x.id`,
    fecha: `x."sentAt"`,
    titulo: `coalesce(x.subject, '(sin asunto)')`,
    extra: `jsonb_build_object('direccion', x.direction, 'contactoEmail', x."recipientEmail", 'buzon', x.upn)`,
  },
  reuniones: {
    from: `"CalendarIngest" x JOIN "Empresa" e ON e.id = x."empresaId"`,
    campos: [`x.subject`],
    id: `x.id`,
    fecha: `x."startAt"`,
    titulo: `coalesce(x.subject, '(sin asunto)')`,
    extra: `jsonb_build_object('online', x."isOnlineMeeting")`,
  },
  notas_finder: {
    from: `"FinderNote" x JOIN "Empresa" e ON e.id = x."empresaId" LEFT JOIN "Finder" f ON f.id = x."finderId"`,
    campos: [`x.contenido`],
    id: `x.id`,
    fecha: `x."createdAt"`,
    titulo: `'Nota de finder'`,
    extra: `jsonb_build_object('finder', f.name)`,
  },
  borme: {
    from: `"BormeAlerta" x JOIN "Empresa" e ON e.id = x."empresaId"`,
    campos: [`x.descripcion`],
    id: `x.id`,
    fecha: `x.fecha`,
    titulo: `x."tipoActo"`,
    extra: `jsonb_build_object('url', x."urlBorme")`,
  },
  empresas: {
    from: `"Empresa" e`,
    campos: [`e.descripcion`, `e."nombreComercial"`, `e.servicios`],
    id: `e.id`,
    fecha: `e."updatedAt"`,
    titulo: `'Ficha de empresa'`,
    extra: `jsonb_build_object('provincia', e.provincia, 'sector', e.sector)`,
  },
  contactos: {
    from: `"Contacto" x JOIN "Empresa" e ON e.id = x."empresaId"`,
    campos: [`x.nombre`, `x.cargo`, `x.email`, `x.notas`],
    id: `x.id`,
    fecha: `x."updatedAt"`,
    titulo: `x.nombre`,
    extra: `jsonb_build_object('cargo', x.cargo, 'email', x.email)`,
  },
  crm: {
    from: `"CrmLog" x JOIN "Empresa" e ON e.id = x."empresaId" LEFT JOIN "User" u ON u.id = x."autorId"`,
    campos: [`x.note`],
    id: `x.id`,
    fecha: `x."createdAt"`,
    titulo: `concat_ws(' → ', x."fromStage", x."toStage")`,
    extra: `jsonb_build_object('evento', x.event, 'autor', u.name)`,
  },
};

type Fila = {
  id: number;
  fecha: Date | null;
  empresaId: number;
  empresa: string;
  titulo: string | null;
  texto: string;
  extra: Record<string, unknown> | null;
  total: bigint;
};

function norm(col: string): Prisma.Sql {
  return Prisma.raw(`translate(lower(coalesce(${col}, '')), '${ACENTOS_DESDE}', '${ACENTOS_HASTA}')`);
}

async function buscarEnAmbito(
  ambito: Ambito,
  terminos: string[],
  filtros: { empresaId?: number; desde?: Date; hasta?: Date },
  limit: number
): Promise<{ total: number; filas: Fila[] }> {
  const d = DEF[ambito];
  const condiciones: Prisma.Sql[] = terminos.map((t) => {
    const patron = patronInicioPalabra(t);
    return Prisma.sql`(${Prisma.join(
      d.campos.map((c) => Prisma.sql`${norm(c)} ~ ${patron}`),
      " OR "
    )})`;
  });
  if (filtros.empresaId) condiciones.push(Prisma.sql`e.id = ${filtros.empresaId}`);
  if (filtros.desde) condiciones.push(Prisma.sql`${Prisma.raw(d.fecha)} >= ${filtros.desde}`);
  if (filtros.hasta) condiciones.push(Prisma.sql`${Prisma.raw(d.fecha)} <= ${filtros.hasta}`);

  const filas = await prisma.$queryRaw<Fila[]>`
    SELECT ${Prisma.raw(d.id)} AS id,
           ${Prisma.raw(d.fecha)} AS fecha,
           e.id AS "empresaId",
           e.nombre AS empresa,
           ${Prisma.raw(d.titulo)} AS titulo,
           concat_ws(' · ', ${Prisma.join(d.campos.map((c) => Prisma.raw(c)))}) AS texto,
           ${Prisma.raw(d.extra)} AS extra,
           count(*) OVER () AS total
    FROM ${Prisma.raw(d.from)}
    WHERE ${Prisma.join(condiciones, " AND ")}
    ORDER BY ${Prisma.raw(d.fecha)} DESC NULLS LAST
    LIMIT ${limit}
  `;
  return { total: filas.length ? Number(filas[0].total) : 0, filas };
}

export function buildBuscarTextoTool() {
  return tool({
    description:
      "Búsqueda de texto libre (sin tildes ni mayúsculas; todos los términos deben aparecer al inicio de una palabra, así 'extin' encuentra 'extintores'; comillas para frases) en notas, tareas (título, descripción y resultado), emails (asunto y cuerpo), reuniones, notas de finders, actos del BORME, fichas de empresa (descripción, nombre comercial, servicios), contactos y comentarios de cambios de etapa. Úsalo para '¿dónde hablamos de X?', '¿qué nos dijo Y sobre el precio?', '¿quién mencionó el earn-out?', '¿en qué empresas aparece Z en el BORME?'. Devuelve un fragmento alrededor de la coincidencia, la empresa y la fecha.",
    inputSchema: z.object({
      query: z
        .string()
        .min(2)
        .describe('Términos a buscar. Ej: \'earn-out\', \'NDA tesein\', \'"carta de intenciones"\'.'),
      ambitos: z
        .array(z.enum(AMBITOS))
        .optional()
        .describe("Dónde buscar. Omitir = en todos."),
      empresaId: z.number().int().positive().optional().describe("Limita a una empresa (de buscar_empresa)."),
      desde: z.string().optional().describe("ISO 8601, fecha mínima."),
      hasta: z.string().optional().describe("ISO 8601, fecha máxima."),
      limit: z.number().int().min(1).max(50).optional().describe("Máximo de resultados en total (default 20)."),
    }),
    execute: async ({
      query,
      ambitos,
      empresaId,
      desde,
      hasta,
      limit,
    }: {
      query: string;
      ambitos?: Ambito[];
      empresaId?: number;
      desde?: string;
      hasta?: string;
      limit?: number;
    }) => {
      const terminos = terminosBusqueda(query);
      if (terminos.length === 0) {
        return { error: "La búsqueda necesita al menos un término de 2 caracteres o más." };
      }
      const desdeDate = desde ? new Date(desde) : undefined;
      const hastaDate = hasta ? new Date(hasta) : undefined;
      if ((desdeDate && isNaN(desdeDate.getTime())) || (hastaDate && isNaN(hastaDate.getTime()))) {
        return { error: "Fecha inválida: usa ISO 8601 (YYYY-MM-DD)." };
      }
      const max = limit ?? 20;
      const lista = ambitos?.length ? ambitos : [...AMBITOS];

      try {
        const porAmbito = await Promise.all(
          lista.map(async (a) => ({
            ambito: a,
            ...(await buscarEnAmbito(a, terminos, { empresaId, desde: desdeDate, hasta: hastaDate }, max)),
          }))
        );
        const resultados = porAmbito
          .flatMap(({ ambito, filas }) =>
            filas.map((f) => ({
              ambito,
              id: f.id,
              fecha: f.fecha ? f.fecha.toISOString().slice(0, 10) : null,
              empresaId: f.empresaId,
              empresa: f.empresa,
              titulo: f.titulo,
              fragmento: fragmento(f.texto, terminos),
              ...(f.extra ?? {}),
            }))
          )
          .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
          .slice(0, max);

        const coincidencias = Object.fromEntries(
          porAmbito.filter((p) => p.total > 0).map((p) => [p.ambito, p.total])
        );
        const totalCoincidencias = porAmbito.reduce((s, p) => s + p.total, 0);
        return {
          terminos,
          coincidenciasPorAmbito: coincidencias,
          totalCoincidencias,
          mostrados: resultados.length,
          ...(totalCoincidencias > resultados.length
            ? { aviso: "Hay más coincidencias que las mostradas: acota por ámbito, empresa o fechas." }
            : {}),
          resultados,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown";
        return { error: message };
      }
    },
  });
}
