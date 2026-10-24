import type { EmpresaDetalle } from "@/types";
import { estadoPasiva, PASIVA_LABEL, SERVICIOS_PASIVA, type ServicioPasiva } from "@/lib/pasiva";
import { SectionLabel } from "./primitives";

export function ActividadPasiva({ empresa }: { empresa: EmpresaDetalle }) {
  const estado = estadoPasiva(empresa.proteccionPasiva);
  return (
    <section className="mt-3 border-t border-wr-border pt-3" aria-label="Actividad de protección pasiva">
      <SectionLabel>PCI pasiva</SectionLabel>
      <p className={`text-xs ${estado === "confirmada" ? "text-orange-300" : "text-wr-muted"}`}>
        {PASIVA_LABEL[estado]}
      </p>
      {empresa.pasivaServicios?.length > 0 ? (
        <p className="mt-1 text-xs text-wr-muted">
          {empresa.pasivaServicios.map((s) => SERVICIOS_PASIVA[s as ServicioPasiva] ?? s).join(" · ")}
        </p>
      ) : null}
      {empresa.pasivaRevisadaAt ? (
        <p className="mt-1 text-[10px] text-wr-hint">Revisada el {new Date(empresa.pasivaRevisadaAt).toLocaleDateString("es-ES")}</p>
      ) : null}
      {empresa.pasivaEvidencias?.length > 0 ? (
        <details className="mt-2 text-xs text-wr-muted">
          <summary className="cursor-pointer py-1">Fuentes ({empresa.pasivaEvidencias.length})</summary>
          <ul className="mt-1 space-y-2">
            {empresa.pasivaEvidencias.map((e) => (
              <li key={`${e.tipo}:${e.url}`}>
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-wr-blue hover:underline">{e.fuente} ↗</a>
                <span className="ml-1 text-wr-hint">({e.fecha})</span>
                <p className="mt-0.5">{e.descripcion}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
