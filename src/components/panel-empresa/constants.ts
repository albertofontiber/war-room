export const SECTOR_LABEL: Record<string, string> = {
  PCI: "PCI",
  seguridad_electronica: "Seg. Electrónica",
  mixto: "Mixto",
};

export function bormeContexto(
  tipoActo: string,
  grupoNombre: string | null | undefined
): string | null {
  if (!grupoNombre) return null;
  if (tipoActo === "posible_adquisicion" || tipoActo === "nombramiento_grupo")
    return `por ${grupoNombre}`;
  if (tipoActo === "adquisicion") return `por ${grupoNombre}`;
  if (tipoActo === "fusion") return `con ${grupoNombre}`;
  return null;
}
