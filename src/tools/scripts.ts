import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject } from "../lib/gbsproj-parser.js";
import {
  resolveTarget,
  getSlot,
  SLOTS_BY_TARGET,
  type EntityKind,
} from "../lib/project-helpers.js";
import { ok, err, handler } from "../lib/mcp-response.js";
import type { GBSActor, GBSTrigger, GBSEvent } from "../types/gbstudio.js";

const SCRIPT_TARGETS = ["scene", "actor", "trigger"] as const;

function summarizeEvents(events: GBSEvent[]): object[] {
  return events.map((evt) => ({
    id: evt.id,
    command: evt.command,
    args: evt.args ?? {},
    childrenKeys: evt.children ? Object.keys(evt.children) : [],
  }));
}

export function registerScriptTools(server: McpServer): void {
  server.registerTool(
    "get_script",
    {
      title: "Leer script de un actor, escena o trigger",
      description: [
        "Lee los eventos de script de un actor, escena o trigger específico.",
        "Para actores: slots disponibles son script (onInteract), startScript (onStart), updateScript (onUpdate), hit1Script, hit2Script, hit3Script.",
        "Para escenas: slots disponibles son script (onInit), playerHitScript, playerHit2Script, playerHit3Script.",
        "Para triggers: slots disponibles son script (onEnter), leaveScript (onLeave).",
      ].join(" "),
      inputSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
        target: z.enum(SCRIPT_TARGETS).describe("Tipo de entidad: scene, actor o trigger"),
        sceneId: z.string().optional().describe("ID de la escena (siempre requerido)"),
        sceneName: z.string().optional().describe("Nombre de la escena (alternativa a sceneId)"),
        entityId: z.string().optional().describe("ID del actor o trigger"),
        entityName: z.string().optional().describe("Nombre del actor o trigger"),
        slot: z.string().optional().describe("Slot de script (defecto: script)"),
      },
    },
    handler(async ({
      projectPath,
      target,
      sceneId,
      sceneName,
      entityId,
      entityName,
      slot,
    }: {
      projectPath: string;
      target: EntityKind;
      sceneId?: string;
      sceneName?: string;
      entityId?: string;
      entityName?: string;
      slot?: string;
    }) => {
      const project = loadProject(projectPath);
      const resolved = resolveTarget(project, target, sceneId, sceneName, entityId, entityName);
      if (typeof resolved === "string") return err(resolved);

      const { entity, scene } = resolved;
      const validSlots = SLOTS_BY_TARGET[target];
      const resolvedSlot = slot ?? "script";
      if (!validSlots.includes(resolvedSlot)) {
        return err(`Slot inválido para ${target}: "${resolvedSlot}". Válidos: ${validSlots.join(", ")}`);
      }

      const events = summarizeEvents(getSlot(entity, resolvedSlot));
      const base = {
        sceneId: scene.id,
        sceneName: scene.name,
        slot: resolvedSlot,
        eventCount: events.length,
        events,
      };

      if (target === "actor") {
        const actor = entity as GBSActor;
        return ok({ ...base, actorId: actor.id, actorName: actor.name });
      }
      if (target === "trigger") {
        const trigger = entity as GBSTrigger;
        return ok({ ...base, triggerId: trigger.id, triggerName: trigger.name });
      }
      return ok(base);
    })
  );
}
