// Helpers de respuesta MCP compartidos por todos los tools.

export const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

export const err = (msg: string) => ({
  content: [{ type: "text" as const, text: `Error: ${msg}` }],
  isError: true as const,
});

// Envuelve un handler MCP para capturar excepciones automáticamente
// y devolver una respuesta de error consistente.
export function handler<A, R>(fn: (args: A) => Promise<R>) {
  return async (args: A): Promise<R | ReturnType<typeof err>> => {
    try {
      return await fn(args);
    } catch (e) {
      return err(String(e));
    }
  };
}
