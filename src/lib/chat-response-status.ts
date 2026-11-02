/** Detecta un stream cerrado sin una respuesta final visible y completa. */
export function isIncompleteChatResponse(
  parts: ReadonlyArray<{ type: string; text?: string }>,
  finishReason: string | undefined,
): boolean {
  const hasText = parts.some((part) => part.type === "text" && part.text?.trim());
  return finishReason !== "stop" || !hasText;
}
