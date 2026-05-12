import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error("[gb-studio-mcp] Servidor iniciado y esperando conexiones...");
}

main().catch((err) => {
  console.error("[gb-studio-mcp] Error fatal:", err);
  process.exit(1);
});
