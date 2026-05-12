import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject, saveProject } from "../lib/gbsproj-parser.js";
import { resolveScene, resolveActor, resolveTrigger, removeEventById, updateEventArgs } from "../lib/project-helpers.js";
import type { GBSScene, GBSActor, GBSTrigger, GBSEvent, GBSSlottable } from "../types/gbstudio.js";

const SCRIPT_TARGETS = ["scene", "actor", "trigger"] as const;

const VALID_SLOTS: Record<string, readonly string[]> = {
  scene: ["script", "playerHitScript", "playerHit2Script", "playerHit3Script"],
  actor: ["script", "startScript", "updateScript", "hit1Script", "hit2Script", "hit3Script"],
  trigger: ["script", "leaveScript"],
};

const SCENE_SLOTS = ["script", "playerHitScript", "playerHit2Script", "playerHit3Script"];
const ACTOR_SLOTS = ["script", "startScript", "updateScript", "hit1Script", "hit2Script", "hit3Script"];
const TRIGGER_SLOTS = ["script", "leaveScript"];

type AnyEntity = GBSScene | GBSActor | GBSTrigger;

function getSlot(entity: AnyEntity, slot: string): GBSEvent[] {
  return ((entity as GBSSlottable)[slot] as GBSEvent[] | undefined) ?? [];
}

function setSlot(entity: AnyEntity, slot: string, events: GBSEvent[]): void {
  (entity as GBSSlottable)[slot] = events;
}

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const err = (msg: string) => ({
  content: [{ type: "text" as const, text: `Error: ${msg}` }],
  isError: true as const,
});

function resolveTarget(
  project: ReturnType<typeof loadProject>,
  target: "scene" | "actor" | "trigger",
  sceneId?: string,
  sceneName?: string,
  entityId?: string,
  entityName?: string
): { entity: AnyEntity; scene: GBSScene } | string {
  if (!sceneId && !sceneName) return "Debes proporcionar sceneId o sceneName";
  const scene = resolveScene(project, sceneId, sceneName);
  if (!scene) return `Escena no encontrada: ${sceneId ?? sceneName}`;

  if (target === "scene") return { entity: scene, scene };

  if (target === "actor") {
    if (!entityId && !entityName) return "Debes proporcionar entityId o entityName para target=actor";
    const actor = resolveActor(scene, entityId, entityName);
    if (!actor) return `Actor no encontrado: ${entityId ?? entityName}`;
    return { entity: actor, scene };
  }

  if (!entityId && !entityName) return "Debes proporcionar entityId o entityName para target=trigger";
  const trigger = resolveTrigger(scene, entityId, entityName);
  if (!trigger) return `Trigger no encontrado: ${entityId ?? entityName}`;
  return { entity: trigger, scene };
}

export function registerScriptWriteTools(server: McpServer): void {
  server.registerTool(
    "add_script_event",
    {
      title: "Añadir evento a un script",
      description: [
        "Añade un nuevo evento al script de un actor, escena o trigger.",
        "El comando debe ser un nombre de evento GB Studio (ej: EVENT_TEXT, EVENT_SWITCH_SCENE, EVENT_SET_VALUE, EVENT_IF_VALUE).",
        "Slots de escena: script, playerHitScript, playerHit2Script, playerHit3Script.",
        "Slots de actor: script (interact), startScript, updateScript, hit1Script, hit2Script, hit3Script.",
        "Slots de trigger: script (onEnter), leaveScript (onLeave).",
      ].join(" "),
      inputSchema: {
        projectPath: z.string(),
        target: z.enum(SCRIPT_TARGETS).describe("Tipo de entidad: scene, actor o trigger"),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
        entityId: z.string().optional().describe("ID del actor o trigger (para target=actor/trigger)"),
        entityName: z.string().optional().describe("Nombre del actor o trigger (búsqueda parcial)"),
        slot: z.string().optional().describe("Slot del script (defecto: script)"),
        command: z.string().describe("Nombre del comando GB Studio"),
        args: z.record(z.string(), z.unknown()).optional().describe("Argumentos del evento como objeto JSON"),
        index: z.number().int().optional().describe("Posición donde insertar (defecto: al final)"),
      },
    },
    async ({ projectPath, target, sceneId, sceneName, entityId, entityName, slot, command, args, index }) => {
      try {
        const project = loadProject(projectPath);
        const resolved = resolveTarget(project, target, sceneId, sceneName, entityId, entityName);
        if (typeof resolved === "string") return err(resolved);

        const { entity } = resolved;
        const resolvedSlot = slot ?? "script";
        if (!VALID_SLOTS[target].includes(resolvedSlot)) {
          return err(`Slot inválido para ${target}: "${resolvedSlot}". Válidos: ${VALID_SLOTS[target].join(", ")}`);
        }

        const newEvent: GBSEvent = { id: randomUUID(), command, args: args ?? {} };
        const events = [...getSlot(entity, resolvedSlot)];
        if (index !== undefined && index >= 0 && index < events.length) {
          events.splice(index, 0, newEvent);
        } else {
          events.push(newEvent);
        }
        setSlot(entity, resolvedSlot, events);
        saveProject(projectPath, project);
        return ok({ created: true, event: newEvent, slot: resolvedSlot, totalEvents: events.length });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "remove_script_event",
    {
      title: "Eliminar evento de un script",
      description: "Busca un evento por su ID en todo el proyecto y lo elimina (incluyendo eventos anidados en bloques if/else).",
      inputSchema: {
        projectPath: z.string(),
        eventId: z.string().describe("ID del evento a eliminar"),
      },
    },
    async ({ projectPath, eventId }) => {
      try {
        const project = loadProject(projectPath);
        let removed = false;
        let foundIn: string | null = null;

        outer: for (const scene of project.scenes) {
          for (const slot of SCENE_SLOTS) {
            const r = removeEventById(getSlot(scene, slot), eventId);
            if (r.removed) {
              setSlot(scene, slot, r.events);
              removed = true;
              foundIn = `escena "${scene.name}" › ${slot}`;
              break outer;
            }
          }
          for (const actor of scene.actors) {
            for (const slot of ACTOR_SLOTS) {
              const r = removeEventById(getSlot(actor, slot), eventId);
              if (r.removed) {
                setSlot(actor, slot, r.events);
                removed = true;
                foundIn = `actor "${actor.name}" (escena "${scene.name}") › ${slot}`;
                break outer;
              }
            }
          }
          for (const trigger of scene.triggers) {
            for (const slot of TRIGGER_SLOTS) {
              const r = removeEventById(getSlot(trigger, slot), eventId);
              if (r.removed) {
                setSlot(trigger, slot, r.events);
                removed = true;
                foundIn = `trigger "${trigger.name}" (escena "${scene.name}") › ${slot}`;
                break outer;
              }
            }
          }
        }

        if (!removed) return err(`Evento no encontrado en el proyecto: ${eventId}`);
        saveProject(projectPath, project);
        return ok({ deleted: true, eventId, foundIn });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "update_script_event",
    {
      title: "Actualizar args de un evento de script",
      description: "Busca un evento por ID en todo el proyecto y fusiona los nuevos args con los existentes (merge parcial).",
      inputSchema: {
        projectPath: z.string(),
        eventId: z.string().describe("ID del evento a modificar"),
        args: z.record(z.string(), z.unknown()).describe("Nuevos args a fusionar con los existentes"),
      },
    },
    async ({ projectPath, eventId, args }) => {
      try {
        const project = loadProject(projectPath);
        let updated = false;
        let foundIn: string | null = null;

        outer: for (const scene of project.scenes) {
          for (const slot of SCENE_SLOTS) {
            const r = updateEventArgs(getSlot(scene, slot), eventId, args);
            if (r.updated) {
              setSlot(scene, slot, r.events);
              updated = true;
              foundIn = `escena "${scene.name}" › ${slot}`;
              break outer;
            }
          }
          for (const actor of scene.actors) {
            for (const slot of ACTOR_SLOTS) {
              const r = updateEventArgs(getSlot(actor, slot), eventId, args);
              if (r.updated) {
                setSlot(actor, slot, r.events);
                updated = true;
                foundIn = `actor "${actor.name}" (escena "${scene.name}") › ${slot}`;
                break outer;
              }
            }
          }
          for (const trigger of scene.triggers) {
            for (const slot of TRIGGER_SLOTS) {
              const r = updateEventArgs(getSlot(trigger, slot), eventId, args);
              if (r.updated) {
                setSlot(trigger, slot, r.events);
                updated = true;
                foundIn = `trigger "${trigger.name}" (escena "${scene.name}") › ${slot}`;
                break outer;
              }
            }
          }
        }

        if (!updated) return err(`Evento no encontrado en el proyecto: ${eventId}`);
        saveProject(projectPath, project);
        return ok({ updated: true, eventId, foundIn, mergedArgs: args });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "set_dialogue",
    {
      title: "Añadir diálogo (EVENT_TEXT)",
      description: "Shortcut: añade un cuadro de diálogo al script de un actor, escena o trigger.",
      inputSchema: {
        projectPath: z.string(),
        target: z.enum(SCRIPT_TARGETS),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
        entityId: z.string().optional(),
        entityName: z.string().optional(),
        slot: z.string().optional().describe("Slot del script (defecto: script)"),
        text: z.string().describe("Texto del diálogo"),
      },
    },
    async ({ projectPath, target, sceneId, sceneName, entityId, entityName, slot, text }) => {
      try {
        const project = loadProject(projectPath);
        const resolved = resolveTarget(project, target, sceneId, sceneName, entityId, entityName);
        if (typeof resolved === "string") return err(resolved);

        const { entity } = resolved;
        const resolvedSlot = slot ?? "script";
        const newEvent: GBSEvent = { id: randomUUID(), command: "EVENT_TEXT", args: { text: [text] } };
        setSlot(entity, resolvedSlot, [...getSlot(entity, resolvedSlot), newEvent]);
        saveProject(projectPath, project);
        return ok({ created: true, event: newEvent, slot: resolvedSlot });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "add_scene_transition",
    {
      title: "Añadir transición de escena (EVENT_SWITCH_SCENE)",
      description: "Shortcut: añade un evento para cambiar a otra escena con posición y dirección del jugador.",
      inputSchema: {
        projectPath: z.string(),
        target: z.enum(SCRIPT_TARGETS),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
        entityId: z.string().optional(),
        entityName: z.string().optional(),
        slot: z.string().optional().describe("Slot del script (defecto: script)"),
        targetSceneId: z.string().describe("ID de la escena de destino"),
        targetX: z.number().int().min(0).describe("Posición X del jugador en la escena destino"),
        targetY: z.number().int().min(0).describe("Posición Y del jugador en la escena destino"),
        direction: z.enum(["up", "down", "left", "right"]).optional().describe("Dirección al llegar (defecto: down)"),
      },
    },
    async ({ projectPath, target, sceneId, sceneName, entityId, entityName, slot, targetSceneId, targetX, targetY, direction }) => {
      try {
        const project = loadProject(projectPath);
        const destScene = project.scenes.find((s) => s.id === targetSceneId);
        if (!destScene) return err(`Escena destino no encontrada: ${targetSceneId}`);

        const resolved = resolveTarget(project, target, sceneId, sceneName, entityId, entityName);
        if (typeof resolved === "string") return err(resolved);

        const { entity } = resolved;
        const resolvedSlot = slot ?? "script";
        const newEvent: GBSEvent = {
          id: randomUUID(),
          command: "EVENT_SWITCH_SCENE",
          args: { sceneId: targetSceneId, x: targetX, y: targetY, direction: direction ?? "down" },
        };
        setSlot(entity, resolvedSlot, [...getSlot(entity, resolvedSlot), newEvent]);
        saveProject(projectPath, project);
        return ok({ created: true, event: newEvent, slot: resolvedSlot, targetScene: { id: destScene.id, name: destScene.name } });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "set_variable",
    {
      title: "Añadir evento de asignación de variable (EVENT_SET_VALUE)",
      description: "Shortcut: añade un evento que asigna un valor numérico a una variable global.",
      inputSchema: {
        projectPath: z.string(),
        target: z.enum(SCRIPT_TARGETS),
        sceneId: z.string().optional(),
        sceneName: z.string().optional(),
        entityId: z.string().optional(),
        entityName: z.string().optional(),
        slot: z.string().optional(),
        variableId: z.string().describe("ID de la variable global (ej: '0', '1')"),
        value: z.number().describe("Valor numérico a asignar"),
      },
    },
    async ({ projectPath, target, sceneId, sceneName, entityId, entityName, slot, variableId, value }) => {
      try {
        const project = loadProject(projectPath);
        const variable = project.variables.find((v) => v.id === variableId);
        if (!variable) return err(`Variable no encontrada: ${variableId}`);

        const resolved = resolveTarget(project, target, sceneId, sceneName, entityId, entityName);
        if (typeof resolved === "string") return err(resolved);

        const { entity } = resolved;
        const resolvedSlot = slot ?? "script";
        const newEvent: GBSEvent = {
          id: randomUUID(),
          command: "EVENT_SET_VALUE",
          args: { variable: variableId, value },
        };
        setSlot(entity, resolvedSlot, [...getSlot(entity, resolvedSlot), newEvent]);
        saveProject(projectPath, project);
        return ok({ created: true, event: newEvent, slot: resolvedSlot, variable: { id: variable.id, name: variable.name } });
      } catch (e) {
        return err(String(e));
      }
    }
  );
}
