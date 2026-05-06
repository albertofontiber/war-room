import type { EmpresaDetalle } from "@/types";
import { Initials } from "./primitives";

export function PanelHeader({
  empresa,
  modoPresentacion,
  onClose,
}: {
  empresa: EmpresaDetalle;
  modoPresentacion: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 sm:p-4 border-b border-wr-border">
      {empresa.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={empresa.logoUrl}
          alt=""
          className="w-12 h-12 object-contain rounded-lg border border-wr-border bg-wr-surface2 flex-shrink-0"
        />
      ) : (
        <Initials nombre={empresa.nombre} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {empresa.web ? (
              <a
                href={empresa.web.startsWith("http") ? empresa.web : `https://${empresa.web}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`font-semibold text-sm text-wr-text hover:text-wr-blue transition-colors truncate block ${modoPresentacion ? "blur-sm select-none" : ""}`}
              >
                {empresa.nombre}{" "}
                <span className="text-wr-blue text-xs">↗</span>
              </a>
            ) : (
              <p className={`font-semibold text-sm text-wr-text truncate ${modoPresentacion ? "blur-sm select-none" : ""}`}>
                {empresa.nombre}
              </p>
            )}
            <p className="text-wr-muted text-xs truncate">
              {empresa.localidad
                ? `${empresa.localidad}, ${empresa.provincia}`
                : empresa.provincia}{" "}
              · {empresa.ccaa}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-wr-muted hover:text-wr-text transition-colors p-1 rounded flex-shrink-0 -mt-0.5"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
