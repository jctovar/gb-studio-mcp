import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject } from "../lib/gbsproj-parser.js";
import { ok, handler } from "../lib/mcp-response.js";

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
    handler(async ({ projectPath, filter }: { projectPath: string; filter?: string }) => {
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

      return ok({
        total: project.variables.length,
        filtered: variables.length,
        variables: variables.map((v) => ({
          id: v.id,
          name: v.name,
          symbol: v.symbol ?? null,
        })),
      });
    })
  );
}
