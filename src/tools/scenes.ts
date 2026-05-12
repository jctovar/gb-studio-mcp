import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject } from "../lib/gbsproj-parser.js";
import type { GBSScene } from "../types/gbstudio.js";

function sceneSummary(scene: GBSScene) {
  return {
    id: scene.id,
    name: scene.name,
    type: scene.type ?? "topDown",
    width: scene.width,
    height: scene.height,
    backgroundId: scene.backgroundId,
    actorCount: scene.actors?.length ?? 0,
    triggerCount: scene.triggers?.length ?? 0,
    notes: scene.notes ?? null,
    symbol: scene.symbol ?? null,
  };
}

export function registerSceneTools(server: McpServer): void {
  server.registerTool(
    "list_scenes",
    {
      title: "Listar escenas del proyecto",
      description:
        "Retorna la lista de escenas del proyecto con su nombre, tipo, dimensiones, número de actores y triggers.",
      inputSchema: {
        projectPath: z
          .string()
          .describe("Ruta al archivo .gbsproj"),
      },
    },
    async ({ projectPath }) => {
      try {
        const project = loadProject(projectPath);

        const scenes = project.scenes.map(sceneSummary);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(scenes, null, 2),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(e)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "get_scene",
    {
      title: "Obtener detalle de una escena",
      description:
        "Retorna el detalle completo de una escena específica incluyendo todos sus actores y triggers. Se puede buscar por nombre o por ID.",
      inputSchema: {
        projectPath: z
          .string()
          .describe("Ruta al archivo .gbsproj"),
        sceneId: z
          .string()
          .optional()
          .describe("ID UUID de la escena"),
        sceneName: z
          .string()
          .optional()
          .describe("Nombre de la escena (búsqueda parcial, sin distinguir mayúsculas)"),
      },
    },
    async ({ projectPath, sceneId, sceneName }) => {
      try {
        if (!sceneId && !sceneName) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: debes proporcionar sceneId o sceneName",
              },
            ],
            isError: true,
          };
        }

        const project = loadProject(projectPath);

        const scene = project.scenes.find((s) => {
          if (sceneId) return s.id === sceneId;
          return s.name.toLowerCase().includes(sceneName!.toLowerCase());
        });

        if (!scene) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Escena no encontrada: ${sceneId ?? sceneName}`,
              },
            ],
            isError: true,
          };
        }

        const detail = {
          ...sceneSummary(scene),
          actors: scene.actors.map((a) => ({
            id: a.id,
            name: a.name,
            x: a.x,
            y: a.y,
            spriteSheetId: a.spriteSheetId ?? null,
            movementType: a.movementType ?? null,
            direction: a.direction ?? null,
            symbol: a.symbol ?? null,
            scriptEventCount: a.script?.length ?? 0,
          })),
          triggers: scene.triggers.map((t) => ({
            id: t.id,
            name: t.name,
            x: t.x,
            y: t.y,
            width: t.width,
            height: t.height,
            symbol: t.symbol ?? null,
            scriptEventCount: t.script?.length ?? 0,
          })),
          scriptEventCount: scene.script?.length ?? 0,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(detail, null, 2),
            },
          ],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(e)}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "list_actors",
    {
      title: "Listar actores de una escena",
      description:
        "Lista todos los actores de una escena específica con su posición, sprite y número de eventos de script.",
      inputSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
        sceneId: z
          .string()
          .optional()
          .describe("ID UUID de la escena"),
        sceneName: z
          .string()
          .optional()
          .describe("Nombre de la escena"),
      },
    },
    async ({ projectPath, sceneId, sceneName }) => {
      try {
        if (!sceneId && !sceneName) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: debes proporcionar sceneId o sceneName",
              },
            ],
            isError: true,
          };
        }

        const project = loadProject(projectPath);

        const scene = project.scenes.find((s) => {
          if (sceneId) return s.id === sceneId;
          return s.name.toLowerCase().includes(sceneName!.toLowerCase());
        });

        if (!scene) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Escena no encontrada: ${sceneId ?? sceneName}`,
              },
            ],
            isError: true,
          };
        }

        const actors = scene.actors.map((a) => ({
          id: a.id,
          name: a.name,
          x: a.x,
          y: a.y,
          spriteSheetId: a.spriteSheetId ?? null,
          movementType: a.movementType ?? null,
          direction: a.direction ?? null,
          animate: a.animate ?? false,
          symbol: a.symbol ?? null,
          scripts: {
            onInteract: a.script?.length ?? 0,
            onStart: a.startScript?.length ?? 0,
            onUpdate: a.updateScript?.length ?? 0,
            onHit1: a.hit1Script?.length ?? 0,
            onHit2: a.hit2Script?.length ?? 0,
            onHit3: a.hit3Script?.length ?? 0,
          },
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { sceneId: scene.id, sceneName: scene.name, actors },
                null,
                2
              ),
            },
          ],
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
