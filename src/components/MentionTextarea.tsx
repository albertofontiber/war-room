"use client";

/**
 * Wrapper conveniente sobre `RichTextEditor` con menciones activadas. La
 * implementación real vive en `RichTextEditor.tsx` (Tiptap + markdown +
 * toolbar + listas). Este archivo se mantiene por compat con los imports
 * existentes en NotasSection y TareasSection.
 *
 * Si todo lo de mention puede expresarse como prop en RichTextEditor (y así
 * es), considera importar `RichTextEditor` directamente en sitios nuevos.
 */

import { RichTextEditor } from "@/components/RichTextEditor";
export type { MentionCandidate } from "@/components/RichTextEditor";

type Props = {
  value: string;
  onChange: (v: string) => void;
  candidatesEndpoint: string;
  empresaId: number;
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
  required?: boolean; // ignorado — RichTextEditor no es nativo HTML required
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
};

export function MentionTextarea({
  candidatesEndpoint,
  empresaId,
  ...rest
}: Props) {
  return (
    <RichTextEditor
      {...rest}
      mentions={{ candidatesEndpoint, empresaId }}
    />
  );
}
