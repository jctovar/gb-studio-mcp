import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject } from "../lib/gbsproj-parser.js";
import { resolveScene } from "../lib/project-helpers.js";
import { ok, err, handler } from "../lib/mcp-response.js";
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
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
      },
    },
    handler(async ({ projectPath }: { projectPath: string }) => {
      const project = loadProject(projectPath);
      return ok(project.scenes.map(sceneSummary));
    })
  );

  server.registerTool(
    "get_scene",
    {
      title: "Obtener detalle de una escena",
      description:
        "Retorna el detalle completo de una escena específica incluyendo todos sus actores y triggers. Se puede buscar por nombre o por ID.",
      inputSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
        sceneId: z.string().optional().describe("ID UUID de la escena"),
        sceneName: z.string().optional().describe("Nombre de la escena (búsqueda parcial, sin distinguir mayúsculas)"),
      },
    },
    handler(async ({ projectPath, sceneId, sceneName }: { projectPath: string; sceneId?: string; sceneName?: string }) => {
      if (!sceneId && !sceneName) return err("debes proporcionar sceneId o sceneName");
      const project = loadProject(projectPath);
      const scene = resolveScene(project, sceneId, sceneName);
      if (!scene) return err(`Escena no encontrada: ${sceneId ?? sceneName}`);

      return ok({
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
      });
    })
  );

  server.registerTool(
    "list_actors",
    {
      title: "Listar actores de una escena",
      description:
        "Lista todos los actores de una escena específica con su posición, sprite y número de eventos de script.",
      inputSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
        sceneId: z.string().optional().describe("ID UUID de la escena"),
        sceneName: z.string().optional().describe("Nombre de la escena"),
      },
    },
    handler(async ({ projectPath, sceneId, sceneName }: { projectPath: string; sceneId?: string; sceneName?: string }) => {
      if (!sceneId && !sceneName) return err("debes proporcionar sceneId o sceneName");
      const project = loadProject(projectPath);
      const scene = resolveScene(project, sceneId, sceneName);
      if (!scene) return err(`Escena no encontrada: ${sceneId ?? sceneName}`);

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
      return ok({ sceneId: scene.id, sceneName: scene.name, actors });
    })
  );
}
