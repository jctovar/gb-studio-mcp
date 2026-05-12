import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject } from "../lib/gbsproj-parser.js";
import type { GBSEvent } from "../types/gbstudio.js";

const SCRIPT_TARGETS = ["scene", "actor", "trigger"] as const;
type ScriptTarget = (typeof SCRIPT_TARGETS)[number];

const ACTOR_SCRIPT_SLOTS = [
  "script",
  "startScript",
  "updateScript",
  "hit1Script",
  "hit2Script",
  "hit3Script",
] as const;

const SCENE_SCRIPT_SLOTS = [
  "script",
  "playerHitScript",
  "playerHit2Script",
  "playerHit3Script",
] as const;

const TRIGGER_SCRIPT_SLOTS = ["script", "leaveScript"] as const;

type ActorSlot = (typeof ACTOR_SCRIPT_SLOTS)[number];
type SceneSlot = (typeof SCENE_SCRIPT_SLOTS)[number];
type TriggerSlot = (typeof TRIGGER_SCRIPT_SLOTS)[number];

function summarizeEvents(events: GBSEvent[] | undefined): object[] {
  if (!events || events.length === 0) return [];
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
        target: z
          .enum(SCRIPT_TARGETS)
          .describe("Tipo de entidad: scene, actor o trigger"),
        sceneId: z
          .string()
          .optional()
          .describe("ID de la escena (siempre requerido para actor y trigger)"),
        sceneName: z
          .string()
          .optional()
          .describe("Nombre de la escena (alternativa a sceneId)"),
        entityId: z
          .string()
          .optional()
          .describe("ID del actor o trigger (requerido si target es actor o trigger)"),
        entityName: z
          .string()
          .optional()
          .describe("Nombre del actor o trigger (alternativa a entityId)"),
        slot: z
          .string()
          .optional()
          .describe(
            "Slot de script a leer. Por defecto: script. Ver descripción para slots disponibles por tipo."
          ),
      },
    },
    async ({ projectPath, target, sceneId, sceneName, entityId, entityName, slot }) => {
      try {
        const project = loadProject(projectPath);

        // Resolver escena
        const scene = project.scenes.find((s) => {
          if (sceneId) return s.id === sceneId;
          if (sceneName) return s.name.toLowerCase().includes(sceneName.toLowerCase());
          return target === "scene";
        });

        if (!scene) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Escena no encontrada: ${sceneId ?? sceneName ?? "(ninguna especificada)"}`,
              },
            ],
            isError: true,
          };
        }

        if (target === "scene") {
          const validSlots = SCENE_SCRIPT_SLOTS as readonly string[];
          const resolvedSlot = (slot ?? "script") as SceneSlot;
          if (!validSlots.includes(resolvedSlot)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Slot inválido para escena: "${resolvedSlot}". Válidos: ${validSlots.join(", ")}`,
                },
              ],
              isError: true,
            };
          }
          const events = summarizeEvents(scene[resolvedSlot] as GBSEvent[] | undefined);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    sceneId: scene.id,
                    sceneName: scene.name,
                    slot: resolvedSlot,
                    eventCount: events.length,
                    events,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (target === "actor") {
          if (!entityId && !entityName) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Debes proporcionar entityId o entityName para target=actor",
                },
              ],
              isError: true,
            };
          }
          const actor = scene.actors.find((a) => {
            if (entityId) return a.id === entityId;
            return a.name.toLowerCase().includes(entityName!.toLowerCase());
          });
          if (!actor) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Actor no encontrado: ${entityId ?? entityName}`,
                },
              ],
              isError: true,
            };
          }
          const validSlots = ACTOR_SCRIPT_SLOTS as readonly string[];
          const resolvedSlot = (slot ?? "script") as ActorSlot;
          if (!validSlots.includes(resolvedSlot)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Slot inválido para actor: "${resolvedSlot}". Válidos: ${validSlots.join(", ")}`,
                },
              ],
              isError: true,
            };
          }
          const events = summarizeEvents(actor[resolvedSlot] as GBSEvent[] | undefined);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    sceneId: scene.id,
                    sceneName: scene.name,
                    actorId: actor.id,
                    actorName: actor.name,
                    slot: resolvedSlot,
                    eventCount: events.length,
                    events,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // target === "trigger"
        if (!entityId && !entityName) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Debes proporcionar entityId o entityName para target=trigger",
              },
            ],
            isError: true,
          };
        }
        const trigger = scene.triggers.find((t) => {
          if (entityId) return t.id === entityId;
          return t.name.toLowerCase().includes(entityName!.toLowerCase());
        });
        if (!trigger) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Trigger no encontrado: ${entityId ?? entityName}`,
              },
            ],
            isError: true,
          };
        }
        const validSlots = TRIGGER_SCRIPT_SLOTS as readonly string[];
        const resolvedSlot = (slot ?? "script") as TriggerSlot;
        if (!validSlots.includes(resolvedSlot)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Slot inválido para trigger: "${resolvedSlot}". Válidos: ${validSlots.join(", ")}`,
              },
            ],
            isError: true,
          };
        }
        const events = summarizeEvents(trigger[resolvedSlot] as GBSEvent[] | undefined);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  sceneId: scene.id,
                  sceneName: scene.name,
                  triggerId: trigger.id,
                  triggerName: trigger.name,
                  slot: resolvedSlot,
                  eventCount: events.length,
                  events,
                },
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
