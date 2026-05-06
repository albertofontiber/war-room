export function PanelSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <aside className="w-full h-full min-h-0 bg-wr-surface border-l border-wr-border flex flex-col animate-slide-in-right">
      <div className="flex items-center justify-between p-3 sm:p-4 border-b border-wr-border">
        <div className="h-3 w-24 bg-wr-surface2 rounded animate-pulse" />
        <button
          onClick={onClose}
          className="text-wr-muted hover:text-wr-text transition-colors p-1 rounded"
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
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-wr-blue border-t-transparent rounded-full animate-spin" />
          <p className="text-wr-hint text-xs">Cargando…</p>
        </div>
      </div>
    </aside>
  );
}
