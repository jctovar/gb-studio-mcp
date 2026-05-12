import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject } from "../lib/gbsproj-parser.js";

export function registerVariableTools(server: McpServer): void {
  server.registerTool(
    "list_variables",
    {
      title: "Listar variables globales",
      description:
        "Retorna todas las variables globales del proyecto con su ID, nombre y símbolo de compilación.",
      inputSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
        filter: z
          .string()
          .optional()
          .describe("Filtrar por nombre (búsqueda parcial, sin distinguir mayúsculas)"),
      },
    },
    async ({ projectPath, filter }) => {
      try {
        const project = loadProject(projectPath);

        let variables = project.variables;
        if (filter) {
          const lc = filter.toLowerCase();
          variables = variables.filter(
            (v) =>
              v.name.toLowerCase().includes(lc) ||
              (v.symbol ?? "").toLowerCase().includes(lc)
          );
        }

        const result = {
          total: project.variables.length,
          filtered: variables.length,
          variables: variables.map((v) => ({
            id: v.id,
            name: v.name,
            symbol: v.symbol ?? null,
          })),
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(e)}` }],
          isError: true,
        };
      }
    }
  );
}
