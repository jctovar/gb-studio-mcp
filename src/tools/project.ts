import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject, validateProject } from "../lib/gbsproj-parser.js";
import { ok, handler } from "../lib/mcp-response.js";

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    "get_project_info",
    {
      title: "Obtener información del proyecto",
      description:
        "Retorna metadatos generales del proyecto GB Studio: nombre, versión del engine, autor, número de escenas, actores, variables y assets.",
      inputSchema: {
        projectPath: z
          .string()
          .describe("Ruta absoluta o relativa al archivo .gbsproj"),
      },
    },
    handler(async ({ projectPath }: { projectPath: string }) => {
      const project = loadProject(projectPath);

      const totalActors = project.scenes.reduce(
        (sum, s) => sum + (s.actors?.length ?? 0),
        0
      );
      const totalTriggers = project.scenes.reduce(
        (sum, s) => sum + (s.triggers?.length ?? 0),
        0
      );

      return ok({
        name: project.name,
        version: project._version,
        release: project._release ?? null,
        author: project.author ?? null,
        notes: project.notes ?? null,
        counts: {
          scenes: project.scenes.length,
          actors: totalActors,
          triggers: totalTriggers,
          variables: project.variables.length,
          customEvents: project.customEvents?.length ?? 0,
          backgrounds: project.backgrounds?.length ?? 0,
          spriteSheets: project.spriteSheets?.length ?? 0,
          music: project.music?.length ?? 0,
          sounds: project.sounds?.length ?? 0,
        },
        settings: {
          colorMode: project.settings.colorMode ?? null,
          musicDriver: project.settings.musicDriver ?? null,
          cartType: project.settings.cartType ?? null,
          sgbEnabled: project.settings.sgbEnabled ?? false,
        },
      });
    })
  );

  server.registerTool(
    "validate_project",
    {
      title: "Validar proyecto GB Studio",
      description:
        "Valida la integridad del proyecto: referencias a assets, IDs únicos, versión compatible.",
      inputSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
      },
    },
    handler(async ({ projectPath }: { projectPath: string }) => {
      const project = loadProject(projectPath);
      return ok(validateProject(project));
    })
  );
}
