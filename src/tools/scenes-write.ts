import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject, saveProject } from "../lib/gbsproj-parser.js";
import { resolveScene, resolveActor, resolveTrigger, toSymbol } from "../lib/project-helpers.js";

const SCENE_TYPES = ["topDown", "platform", "adventure", "shmup", "pointAndClick", "logo"] as const;
const MOVEMENT_TYPES = ["playerInput", "random", "none", "static"] as const;
const DIRECTIONS = ["up", "down", "left", "right"] as const;

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const err = (msg: string) => ({
  content: [{ type: "text" as const, text: `Error: ${msg}` }],
  isError: true as const,
});

export function registerSceneWriteTools(server: McpServer): void {
  server.registerTool(
    "create_scene",
    {
      title: "Crear nueva escena",
      description: "Crea una nueva escena en el proyecto GB Studio con dimensiones y tipo especificados.",
      inputSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
        name: z.string().describe("Nombre de la escena"),
        backgroundId: z.string().optional().describe("ID del background a usar"),
        width: z.number().int().min(1).optional().describe("Ancho en tiles (defecto: 20)"),
        height: z.number().int().min(1).optional().describe("Alto en tiles (defecto: 18)"),
        type: z.enum(SCENE_TYPES).optional().describe("Tipo de escena (defecto: topDown)"),
        notes: z.string().optional(),
      },
    },
    async ({ projectPath, name, backgroundId, width, height, type, notes }) => {
      try {
        const project = loadProject(projectPath);
        const id = randomUUID();
        project.scenes.push({
          id,
          name,
          type: type ?? "topDown",
          backgroundId: backgroundId ?? "",
          width: width ?? 20,
          height: height ?? 18,
          actors: [],
          triggers: [],
          script: [],
          collisions: [],
          symbol: toSymbol(`scene_${name}`),
          notes,
        });
        saveProject(projectPath, project);
        return ok({ created: true, sceneId: id, name, type: type ?? "topDown" });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "update_scene",
    {
      title: "Actualizar escena",
      description: "Modifica propiedades de una escena existente (nombre, background, tipo, notas).",
      inputSchema: {
        projectPath: z.string(),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
        name: z.string().optional().describe("Nuevo nombre"),
        backgroundId: z.string().optional().describe("Nuevo background ID"),
        type: z.enum(SCENE_TYPES).optional(),
        notes: z.string().optional(),
      },
    },
    async ({ projectPath, sceneId, sceneName, name, backgroundId, type, notes }) => {
      try {
        const project = loadProject(projectPath);
        const scene = resolveScene(project, sceneId, sceneName);
        if (!scene) return err(`Escena no encontrada: ${sceneId ?? sceneName}`);

        if (name !== undefined) scene.name = name;
        if (backgroundId !== undefined) scene.backgroundId = backgroundId;
        if (type !== undefined) scene.type = type;
        if (notes !== undefined) scene.notes = notes;
        saveProject(projectPath, project);
        return ok({ updated: true, sceneId: scene.id, sceneName: scene.name });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "delete_scene",
    {
      title: "Eliminar escena",
      description: "Elimina una escena del proyecto. Se crea un backup .bak automáticamente.",
      inputSchema: {
        projectPath: z.string(),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
      },
    },
    async ({ projectPath, sceneId, sceneName }) => {
      try {
        const project = loadProject(projectPath);
        const scene = resolveScene(project, sceneId, sceneName);
        if (!scene) return err(`Escena no encontrada: ${sceneId ?? sceneName}`);

        const warnings: string[] = [];
        if (project.settings.startSceneId === scene.id) {
          warnings.push("Esta es la escena inicial (settings.startSceneId). Actualiza la configuración del proyecto.");
        }

        project.scenes = project.scenes.filter((s) => s.id !== scene.id);
        saveProject(projectPath, project);
        return ok({ deleted: true, sceneId: scene.id, sceneName: scene.name, warnings });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "create_actor",
    {
      title: "Crear actor en una escena",
      description: "Añade un nuevo actor a una escena con posición, sprite y tipo de movimiento.",
      inputSchema: {
        projectPath: z.string(),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
        name: z.string().describe("Nombre del actor"),
        x: z.number().int().min(0).describe("Posición X en tiles"),
        y: z.number().int().min(0).describe("Posición Y en tiles"),
        spriteSheetId: z.string().optional().describe("ID del sprite sheet"),
        movementType: z.enum(MOVEMENT_TYPES).optional().describe("Tipo de movimiento (defecto: static)"),
        direction: z.enum(DIRECTIONS).optional().describe("Dirección inicial (defecto: down)"),
        animate: z.boolean().optional().describe("Animar automáticamente (defecto: false)"),
      },
    },
    async ({ projectPath, sceneId, sceneName, name, x, y, spriteSheetId, movementType, direction, animate }) => {
      try {
        const project = loadProject(projectPath);
        const scene = resolveScene(project, sceneId, sceneName);
        if (!scene) return err(`Escena no encontrada: ${sceneId ?? sceneName}`);

        const id = randomUUID();
        scene.actors.push({
          id,
          name,
          x,
          y,
          spriteSheetId,
          movementType: movementType ?? "static",
          direction: direction ?? "down",
          animate: animate ?? false,
          symbol: toSymbol(`actor_${name}`),
          script: [],
          startScript: [],
          updateScript: [],
          hit1Script: [],
          hit2Script: [],
          hit3Script: [],
        });
        saveProject(projectPath, project);
        return ok({ created: true, actorId: id, name, x, y, sceneId: scene.id, sceneName: scene.name });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "update_actor",
    {
      title: "Actualizar actor",
      description: "Modifica propiedades de un actor: posición, nombre, sprite, movimiento o dirección.",
      inputSchema: {
        projectPath: z.string(),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
        entityId: z.string().optional().describe("ID del actor"),
        entityName: z.string().optional().describe("Nombre del actor (búsqueda parcial)"),
        name: z.string().optional(),
        x: z.number().int().min(0).optional(),
        y: z.number().int().min(0).optional(),
        spriteSheetId: z.string().optional(),
        movementType: z.enum(MOVEMENT_TYPES).optional(),
        direction: z.enum(DIRECTIONS).optional(),
        animate: z.boolean().optional(),
      },
    },
    async ({ projectPath, sceneId, sceneName, entityId, entityName, name, x, y, spriteSheetId, movementType, direction, animate }) => {
      try {
        const project = loadProject(projectPath);
        const scene = resolveScene(project, sceneId, sceneName);
        if (!scene) return err(`Escena no encontrada: ${sceneId ?? sceneName}`);

        const actor = resolveActor(scene, entityId, entityName);
        if (!actor) return err(`Actor no encontrado: ${entityId ?? entityName}`);

        if (name !== undefined) actor.name = name;
        if (x !== undefined) actor.x = x;
        if (y !== undefined) actor.y = y;
        if (spriteSheetId !== undefined) actor.spriteSheetId = spriteSheetId;
        if (movementType !== undefined) actor.movementType = movementType;
        if (direction !== undefined) actor.direction = direction;
        if (animate !== undefined) actor.animate = animate;
        saveProject(projectPath, project);
        return ok({ updated: true, actorId: actor.id, actorName: actor.name });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "delete_actor",
    {
      title: "Eliminar actor",
      description: "Elimina un actor de una escena.",
      inputSchema: {
        projectPath: z.string(),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
        entityId: z.string().optional(),
        entityName: z.string().optional(),
      },
    },
    async ({ projectPath, sceneId, sceneName, entityId, entityName }) => {
      try {
        const project = loadProject(projectPath);
        const scene = resolveScene(project, sceneId, sceneName);
        if (!scene) return err(`Escena no encontrada: ${sceneId ?? sceneName}`);

        const actor = resolveActor(scene, entityId, entityName);
        if (!actor) return err(`Actor no encontrado: ${entityId ?? entityName}`);

        scene.actors = scene.actors.filter((a) => a.id !== actor.id);
        saveProject(projectPath, project);
        return ok({ deleted: true, actorId: actor.id, actorName: actor.name });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "create_trigger",
    {
      title: "Crear trigger en una escena",
      description: "Añade un nuevo trigger rectangular a una escena.",
      inputSchema: {
        projectPath: z.string(),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
        name: z.string().describe("Nombre del trigger"),
        x: z.number().int().min(0).describe("Posición X en tiles"),
        y: z.number().int().min(0).describe("Posición Y en tiles"),
        width: z.number().int().min(1).optional().describe("Ancho en tiles (defecto: 1)"),
        height: z.number().int().min(1).optional().describe("Alto en tiles (defecto: 1)"),
      },
    },
    async ({ projectPath, sceneId, sceneName, name, x, y, width, height }) => {
      try {
        const project = loadProject(projectPath);
        const scene = resolveScene(project, sceneId, sceneName);
        if (!scene) return err(`Escena no encontrada: ${sceneId ?? sceneName}`);

        const id = randomUUID();
        scene.triggers.push({
          id,
          name,
          x,
          y,
          width: width ?? 1,
          height: height ?? 1,
          symbol: toSymbol(`trigger_${name}`),
          script: [],
          leaveScript: [],
        });
        saveProject(projectPath, project);
        return ok({ created: true, triggerId: id, name, x, y, sceneId: scene.id, sceneName: scene.name });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "update_trigger",
    {
      title: "Actualizar trigger",
      description: "Modifica la posición, dimensiones o nombre de un trigger existente.",
      inputSchema: {
        projectPath: z.string(),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
        entityId: z.string().optional().describe("ID del trigger"),
        entityName: z.string().optional().describe("Nombre del trigger (búsqueda parcial)"),
        name: z.string().optional(),
        x: z.number().int().min(0).optional(),
        y: z.number().int().min(0).optional(),
        width: z.number().int().min(1).optional(),
        height: z.number().int().min(1).optional(),
      },
    },
    async ({ projectPath, sceneId, sceneName, entityId, entityName, name, x, y, width, height }) => {
      try {
        const project = loadProject(projectPath);
        const scene = resolveScene(project, sceneId, sceneName);
        if (!scene) return err(`Escena no encontrada: ${sceneId ?? sceneName}`);

        const trigger = resolveTrigger(scene, entityId, entityName);
        if (!trigger) return err(`Trigger no encontrado: ${entityId ?? entityName}`);

        if (name !== undefined) trigger.name = name;
        if (x !== undefined) trigger.x = x;
        if (y !== undefined) trigger.y = y;
        if (width !== undefined) trigger.width = width;
        if (height !== undefined) trigger.height = height;
        saveProject(projectPath, project);
        return ok({ updated: true, triggerId: trigger.id, triggerName: trigger.name });
      } catch (e) {
        return err(String(e));
      }
    }
  );
}
