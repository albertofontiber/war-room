export type FinRow = {
  anio: number;
  ingresos: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
};

export type DocsState = {
  oneDriveUrl: string | null;
  notionUrl: string | null;
  nombreComercial: string | null;
};

export type PanelEmpresaProps = {
  /** Callback al cambiar campos persistentes que afectan a vistas externas (Kanban).
   * Se dispara tras cambio de stage o asignación de finder exitosos. */
  onEmpresaChanged?: () => void;
};
