import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  resolveTarget,
  removeEventById,
  updateEventArgs,
  findEventLocation,
  getSlot,
  setSlot,
  withProject,
  SLOTS_BY_TARGET,
  type EntityKind,
} from "../lib/project-helpers.js";
import { ok, err, handler } from "../lib/mcp-response.js";
import type { GBSEvent } from "../types/gbstudio.js";

const SCRIPT_TARGETS = ["scene", "actor", "trigger"] as const;
const DIRECTIONS = ["up", "down", "left", "right"] as const;
type Direction = (typeof DIRECTIONS)[number];

type TargetArgs = {
  projectPath: string;
  target: EntityKind;
  sceneId?: string;
  sceneName?: string;
  entityId?: string;
  entityName?: string;
  slot?: string;
};

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
        entityId: z.string().optional().describe("ID del actor o trigger"),
        entityName: z.string().optional().describe("Nombre del actor o trigger (búsqueda parcial)"),
        slot: z.string().optional().describe("Slot del script (defecto: script)"),
        command: z.string().describe("Nombre del comando GB Studio"),
        args: z.record(z.string(), z.unknown()).optional().describe("Argumentos del evento"),
        index: z.number().int().optional().describe("Posición donde insertar (defecto: al final)"),
      },
    },
    handler(async (input: TargetArgs & {
      command: string;
      args?: Record<string, unknown>;
      index?: number;
    }) => {
      const { projectPath, target, sceneId, sceneName, entityId, entityName, slot, command, args, index } = input;
      const newEvent: GBSEvent = { id: randomUUID(), command, args: args ?? {} };
      const result = withProject(projectPath, (project): { kind: "err"; msg: string } | { kind: "ok"; slot: string; total: number } => {
        const resolved = resolveTarget(project, target, sceneId, sceneName, entityId, entityName);
        if (typeof resolved === "string") return { kind: "err", msg: resolved };

        const resolvedSlot = slot ?? "script";
        const validSlots = SLOTS_BY_TARGET[target];
        if (!validSlots.includes(resolvedSlot)) {
          return { kind: "err", msg: `Slot inválido para ${target}: "${resolvedSlot}". Válidos: ${validSlots.join(", ")}` };
        }

        const { entity } = resolved;
        const events = [...getSlot(entity, resolvedSlot)];
        if (index !== undefined && index >= 0 && index < events.length) {
          events.splice(index, 0, newEvent);
        } else {
          events.push(newEvent);
        }
        setSlot(entity, resolvedSlot, events);
        return { kind: "ok", slot: resolvedSlot, total: events.length };
      });
      if (result.kind === "err") return err(result.msg);
      return ok({ created: true, event: newEvent, slot: result.slot, totalEvents: result.total });
    })
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
    handler(async ({ projectPath, eventId }: { projectPath: string; eventId: string }) => {
      const result = withProject(projectPath, (project) => {
        const loc = findEventLocation(project, eventId);
        if (!loc) return null;
        const r = removeEventById(getSlot(loc.entity, loc.slot), eventId);
        setSlot(loc.entity, loc.slot, r.events);
        return loc.describe;
      });
      if (!result) return err(`Evento no encontrado en el proyecto: ${eventId}`);
      return ok({ deleted: true, eventId, foundIn: result });
    })
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
    handler(async ({ projectPath, eventId, args }: { projectPath: string; eventId: string; args: Record<string, unknown> }) => {
      const result = withProject(projectPath, (project) => {
        const loc = findEventLocation(project, eventId);
        if (!loc) return null;
        const r = updateEventArgs(getSlot(loc.entity, loc.slot), eventId, args);
        setSlot(loc.entity, loc.slot, r.events);
        return loc.describe;
      });
      if (!result) return err(`Evento no encontrado en el proyecto: ${eventId}`);
      return ok({ updated: true, eventId, foundIn: result, mergedArgs: args });
    })
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
    handler(async (input: TargetArgs & { text: string }) => {
      const { projectPath, target, sceneId, sceneName, entityId, entityName, slot, text } = input;
      const newEvent: GBSEvent = { id: randomUUID(), command: "EVENT_TEXT", args: { text: [text] } };
      const result = withProject(projectPath, (project): { kind: "err"; msg: string } | { kind: "ok"; slot: string } => {
        const resolved = resolveTarget(project, target, sceneId, sceneName, entityId, entityName);
        if (typeof resolved === "string") return { kind: "err", msg: resolved };
        const resolvedSlot = slot ?? "script";
        setSlot(resolved.entity, resolvedSlot, [...getSlot(resolved.entity, resolvedSlot), newEvent]);
        return { kind: "ok", slot: resolvedSlot };
      });
      if (result.kind === "err") return err(result.msg);
      return ok({ created: true, event: newEvent, slot: result.slot });
    })
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
        direction: z.enum(DIRECTIONS).optional().describe("Dirección al llegar (defecto: down)"),
      },
    },
    handler(async (input: TargetArgs & {
      targetSceneId: string;
      targetX: number;
      targetY: number;
      direction?: Direction;
    }) => {
      const { projectPath, target, sceneId, sceneName, entityId, entityName, slot, targetSceneId, targetX, targetY, direction } = input;
      const newEvent: GBSEvent = {
        id: randomUUID(),
        command: "EVENT_SWITCH_SCENE",
        args: { sceneId: targetSceneId, x: targetX, y: targetY, direction: direction ?? "down" },
      };
      const result = withProject(projectPath, (project): { kind: "err"; msg: string } | { kind: "ok"; slot: string; destScene: { id: string; name: string } } => {
        const destScene = project.scenes.find((s) => s.id === targetSceneId);
        if (!destScene) return { kind: "err", msg: `Escena destino no encontrada: ${targetSceneId}` };

        const resolved = resolveTarget(project, target, sceneId, sceneName, entityId, entityName);
        if (typeof resolved === "string") return { kind: "err", msg: resolved };

        const resolvedSlot = slot ?? "script";
        setSlot(resolved.entity, resolvedSlot, [...getSlot(resolved.entity, resolvedSlot), newEvent]);
        return { kind: "ok", slot: resolvedSlot, destScene: { id: destScene.id, name: destScene.name } };
      });
      if (result.kind === "err") return err(result.msg);
      return ok({ created: true, event: newEvent, slot: result.slot, targetScene: result.destScene });
    })
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
    handler(async (input: TargetArgs & { variableId: string; value: number }) => {
      const { projectPath, target, sceneId, sceneName, entityId, entityName, slot, variableId, value } = input;
      const newEvent: GBSEvent = {
        id: randomUUID(),
        command: "EVENT_SET_VALUE",
        args: { variable: variableId, value },
      };
      const result = withProject(projectPath, (project): { kind: "err"; msg: string } | { kind: "ok"; slot: string; variable: { id: string; name: string } } => {
        const variable = project.variables.find((v) => v.id === variableId);
        if (!variable) return { kind: "err", msg: `Variable no encontrada: ${variableId}` };

        const resolved = resolveTarget(project, target, sceneId, sceneName, entityId, entityName);
        if (typeof resolved === "string") return { kind: "err", msg: resolved };

        const resolvedSlot = slot ?? "script";
        setSlot(resolved.entity, resolvedSlot, [...getSlot(resolved.entity, resolvedSlot), newEvent]);
        return { kind: "ok", slot: resolvedSlot, variable: { id: variable.id, name: variable.name } };
      });
      if (result.kind === "err") return err(result.msg);
      return ok({ created: true, event: newEvent, slot: result.slot, variable: result.variable });
    })
  );
}
