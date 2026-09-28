/**
 * O parser browser do PostHog só reconhece seus schemes predefinidos. Assets
 * carregados pelo protocolo próprio têm a mesma origem que teriam via HTTPS
 * ou file; preserve o frame original para o PostHog resolver o source map.
 */
export function normalizeOwnProtocolExceptionFrames(
  properties: Record<string, unknown> | undefined
): void {
  const exceptions = properties?.$exception_list;
  if (!Array.isArray(exceptions)) return;

  for (const exception of exceptions) {
    if (!exception || typeof exception !== "object") continue;
    const stacktrace = (exception as Record<string, unknown>).stacktrace;
    if (!stacktrace || typeof stacktrace !== "object") continue;
    const stack = stacktrace as Record<string, unknown>;
    if (stack.type !== "raw" || !Array.isArray(stack.frames)) continue;

    for (const value of stack.frames) {
      if (!value || typeof value !== "object") continue;
      const frame = value as Record<string, unknown>;
      if (frame.platform !== "web:javascript" || typeof frame.filename !== "string") continue;

      try {
        const url = new URL(frame.filename);
        if (
          url.protocol === "louvorja:" &&
          url.hostname === "app" &&
          !url.port &&
          !url.username &&
          !url.password &&
          url.pathname.startsWith("/assets/") &&
          /\.m?js$/.test(url.pathname)
        ) {
          frame.in_app = true;
        }
      } catch {
        // Um filename que não é URL mantém a classificação do SDK.
      }
    }
  }
}
