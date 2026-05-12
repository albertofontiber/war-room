"use client";

/**
 * Wrapper compat sobre `RichTextRender`. Mantenemos el nombre y la API por
 * los imports existentes (CrmSections, PortalTargetClient, TimelineSection).
 *
 * `RichTextRender` es el nombre canónico ahora — renderiza markdown completo
 * (bold/italic/listas) además de los chips de mención. En sitios nuevos,
 * importar `RichTextRender` directamente.
 */

import { RichTextRender } from "@/components/RichTextRender";

export function MentionRender({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return <RichTextRender content={content} className={className} />;
}
