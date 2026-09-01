/**
 * preview-aviso-registros.ts
 *
 * Escribe a un fichero el correo del cron de registros tal como saldría, para
 * poder mirarlo en el navegador sin mandarlo a nadie. Los datos son los del
 * aviso del 1 de septiembre de 2026, que traía de todo: altas de un registro,
 * y los otros dos caídos.
 *
 *   npx tsx scripts/preview-aviso-registros.ts aviso.html
 */

import fs from "fs";
import { componeAviso } from "@/lib/registros/aviso";
import { renderEmail } from "@/lib/notifications";
import type { ResultadoRegistro } from "@/lib/registros/tipos";

// Los datos del aviso del 1 de septiembre de 2026, tal cual llegaron.
const RIPCI: [string, string, number, number, string][] = [
  ["AMÁN DE AREBA SÁNCHEZ", "09435683W", 1, 0, "ANDALUCÍA"],
  ["CARAILA 21 S.L", "B42839415", 3, 3, "ANDALUCÍA"],
  ["CORPORACION EDIFINTEL SL", "B80472798", 13, 14, "MADRID"],
  ["IRLUC MANTENIMIENTOS Y MONTAJES INDUSTRIALES, S.L.", "B21600499", 9, 8, "ANDALUCÍA"],
  ["J&J MAINTENANCE, INC SUCURSAL EN ESPAÑA.", "W0257950F", 13, 14, "ANDALUCÍA"],
  ["JERESA INSTALACIONES TECNICAS, S.L.", "B83311191", 6, 12, "MADRID"],
  ["JOSE Mª GARRIDO ORELLANA", "26205855T", 10, 11, "ANDALUCÍA"],
  ["LLATJE ELECTROHIDRAULICA, S.L.", "B43030725", 10, 10, "CATALUÑA"],
  ["MANUEL ALGABA PASCUAL", "18217305V", 1, 1, "BALEARES"],
  ["PROVISER IBERICA, S.L.", "B26421750", 13, 14, "RIOJA"],
  ["SEDEÑO INGENIERIA E INSTALACIONES, S.L", "B72243843", 1, 1, "ANDALUCÍA"],
  ["SUBER CLIMATIZACION SL", "B71537781", 13, 14, "NAVARRA"],
];

const resultados: ResultadoRegistro[] = [
  {
    registro: "RIPCI",
    altas: RIPCI.map(([nombre, cif, ins, man, zona]) => ({
      nombre,
      cif,
      zona,
      detalle: `${ins} categorías de instalación y ${man} de mantenimiento`,
    })),
    actualizadas: 8,
    avisos: [],
    resumen: {},
  },
];

const aviso = componeAviso(resultados, [
  "Cepreven: No se encontró el enlace al listado de calificación",
  "Seguridad privada: fetch failed",
])!;

fs.writeFileSync(
  process.argv[2],
  renderEmail({
    titulo: aviso.titulo,
    mensaje: aviso.mensaje,
    cuerpoHtml: aviso.html,
    link: "https://warroom.fontiber.com/",
  }),
  "utf-8"
);
console.log("escrito:", process.argv[2]);
