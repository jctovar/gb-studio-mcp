import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject, validateProject } from "../lib/gbsproj-parser.js";
import { walkProjectEvents } from "../lib/project-helpers.js";
import type { GBSSlottable, GBSEvent } from "../types/gbstudio.js";

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const err = (msg: string) => ({
  content: [{ type: "text" as const, text: `Error: ${msg}` }],
  isError: true as const,
});

export function registerAnalysisTools(server: McpServer): void {
  server.registerTool(
    "search_dialogue",
    {
      title: "Buscar texto de diálogo",
      description:
        "Busca una cadena de texto en todos los eventos EVENT_TEXT del proyecto. Retorna coincidencias con contexto (escena, entidad, slot).",
      inputSchema: {
        projectPath: z.string(),
        query: z.string().describe("Texto a buscar"),
        caseSensitive: z
          .boolean()
          .optional()
          .describe("Búsqueda sensible a mayúsculas (defecto: false)"),
      },
    },
    async ({ projectPath, query, caseSensitive }) => {
      try {
        const project = loadProject(projectPath);
        const sceneMap = new Map(project.scenes.map((s) => [s.id, s.name]));

        const actorIds = new Map<string, string>();
        const triggerIds = new Map<string, string>();
        for (const scene of project.scenes) {
          for (const a of scene.actors) actorIds.set(a.id, a.name);
          for (const t of scene.triggers) triggerIds.set(t.id, t.name);
        }

        const q = caseSensitive ? query : query.toLowerCase();

        const matches: Array<{
          sceneId: string;
          sceneName: string;
          entityType: "scene" | "actor" | "trigger";
          entityId?: string;
          entityName?: string;
          slot: string;
          eventId: string;
          text: string[];
        }> = [];

        walkProjectEvents(project, (evt, ctx) => {
          if (evt.command !== "EVENT_TEXT") return;
          const textArr = (evt.args as Record<string, unknown>)?.text as string[] | undefined;
          if (!textArr) return;

          const full = textArr.join("\n");
          const hay = caseSensitive ? full : full.toLowerCase();
          if (!hay.includes(q)) return;

          let entityType: "scene" | "actor" | "trigger" = "scene";
          if (ctx.entityId) {
            if (actorIds.has(ctx.entityId)) entityType = "actor";
            else if (triggerIds.has(ctx.entityId)) entityType = "trigger";
          }

          matches.push({
            sceneId: ctx.sceneId,
            sceneName: sceneMap.get(ctx.sceneId) ?? ctx.sceneId,
            entityType,
            entityId: ctx.entityId,
            entityName: ctx.entityId
              ? (actorIds.get(ctx.entityId) ?? triggerIds.get(ctx.entityId))
              : undefined,
            slot: ctx.slot,
            eventId: evt.id,
            text: textArr,
          });
        });

        return ok({ query, matchCount: matches.length, matches });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "find_scene_connections",
    {
      title: "Grafo de conexiones entre escenas",
      description:
        "Analiza todos los eventos EVENT_SWITCH_SCENE para construir un grafo de navegación entre escenas. Incluye nodos aislados.",
      inputSchema: {
        projectPath: z.string(),
        sceneId: z.string().optional().describe("Filtrar conexiones desde/hacia una escena específica"),
        sceneName: z.string().optional().describe("Filtrar por nombre de escena (búsqueda parcial)"),
      },
    },
    async ({ projectPath, sceneId, sceneName }) => {
      try {
        const project = loadProject(projectPath);
        const sceneMap = new Map(project.scenes.map((s) => [s.id, s.name]));

        const actorIds = new Map<string, string>();
        const triggerIds = new Map<string, string>();
        for (const scene of project.scenes) {
          for (const a of scene.actors) actorIds.set(a.id, a.name);
          for (const t of scene.triggers) triggerIds.set(t.id, t.name);
        }

        // fromId → toId → list of via descriptors
        type Via = { entityType: "scene" | "actor" | "trigger"; entityId?: string; entityName?: string; slot: string };
        const edgeMap = new Map<string, Map<string, Via[]>>();
        const connectedIds = new Set<string>();

        walkProjectEvents(project, (evt, ctx) => {
          if (evt.command !== "EVENT_SWITCH_SCENE") return;
          const toId = (evt.args as Record<string, unknown>)?.sceneId as string | undefined;
          if (!toId || !sceneMap.has(toId)) return;

          connectedIds.add(ctx.sceneId);
          connectedIds.add(toId);

          let entityType: "scene" | "actor" | "trigger" = "scene";
          if (ctx.entityId) {
            if (actorIds.has(ctx.entityId)) entityType = "actor";
            else if (triggerIds.has(ctx.entityId)) entityType = "trigger";
          }

          if (!edgeMap.has(ctx.sceneId)) edgeMap.set(ctx.sceneId, new Map());
          const toMap = edgeMap.get(ctx.sceneId)!;
          if (!toMap.has(toId)) toMap.set(toId, []);
          toMap.get(toId)!.push({
            entityType,
            entityId: ctx.entityId,
            entityName: ctx.entityId
              ? (actorIds.get(ctx.entityId) ?? triggerIds.get(ctx.entityId))
              : undefined,
            slot: ctx.slot,
          });
        });

        // Filtrar si se especificó escena
        const filterFn = (id: string) => {
          if (!sceneId && !sceneName) return true;
          if (sceneId) return id === sceneId;
          return (sceneMap.get(id) ?? "").toLowerCase().includes(sceneName!.toLowerCase());
        };

        const edges: Array<{
          fromId: string; fromName: string;
          toId: string; toName: string;
          via: Via[];
        }> = [];

        for (const [fromId, toMap] of edgeMap) {
          if (!filterFn(fromId)) continue;
          for (const [toId, via] of toMap) {
            edges.push({
              fromId,
              fromName: sceneMap.get(fromId) ?? fromId,
              toId,
              toName: sceneMap.get(toId) ?? toId,
              via,
            });
          }
        }

        const nodes = project.scenes.map((s) => ({
          id: s.id,
          name: s.name,
          connected: connectedIds.has(s.id),
        }));

        const isolated = project.scenes
          .filter((s) => !connectedIds.has(s.id))
          .map((s) => ({ id: s.id, name: s.name }));

        return ok({
          totalScenes: project.scenes.length,
          connectedScenes: connectedIds.size,
          isolatedScenes: isolated.length,
          edgeCount: edges.length,
          nodes,
          edges,
          isolated,
        });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "analyze_project",
    {
      title: "Análisis completo del proyecto",
      description:
        "Genera estadísticas detalladas: conteos de escenas/actores/variables, comandos más usados, distribución de assets y resumen de validación.",
      inputSchema: {
        projectPath: z.string(),
      },
    },
    async ({ projectPath }) => {
      try {
        const project = loadProject(projectPath);
        const validation = validateProject(project);

        // Conteo de eventos
        const commandCounts = new Map<string, number>();
        let totalEvents = 0;
        walkProjectEvents(project, (evt) => {
          totalEvents++;
          commandCounts.set(evt.command, (commandCounts.get(evt.command) ?? 0) + 1);
        });

        const topCommands = [...commandCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([command, count]) => ({ command, count }));

        // Escenas por actores
        const scenesByActors = [...project.scenes]
          .sort((a, b) => (b.actors?.length ?? 0) - (a.actors?.length ?? 0))
          .slice(0, 5)
          .map((s) => ({
            id: s.id,
            name: s.name,
            actorCount: s.actors?.length ?? 0,
            triggerCount: s.triggers?.length ?? 0,
            scriptEvents: totalScriptEvents(s),
          }));

        const totalActors = project.scenes.reduce((n, s) => n + (s.actors?.length ?? 0), 0);
        const totalTriggers = project.scenes.reduce((n, s) => n + (s.triggers?.length ?? 0), 0);

        // Variables usadas
        const usedVarIds = new Set<string>();
        walkProjectEvents(project, (evt) => {
          const str = JSON.stringify(evt.args ?? {});
          for (const m of str.matchAll(/"(?:variable|variableId)":\s*"([^"]+)"/g)) {
            usedVarIds.add(m[1]);
          }
        });

        return ok({
          name: project.name,
          version: project._version,
          author: project.author ?? null,
          scenes: {
            count: project.scenes.length,
            totalActors,
            totalTriggers,
            topByActors: scenesByActors,
          },
          scripts: {
            totalEvents,
            topCommands,
          },
          assets: {
            backgrounds: project.backgrounds?.length ?? 0,
            sprites: project.spriteSheets?.length ?? 0,
            music: project.music?.length ?? 0,
            sounds: project.sounds?.length ?? 0,
            fonts: project.fonts?.length ?? 0,
          },
          variables: {
            total: project.variables.length,
            usedInScripts: project.variables.filter((v) => usedVarIds.has(v.id)).length,
            unusedCount: project.variables.filter((v) => !usedVarIds.has(v.id)).length,
          },
          customEvents: project.customEvents?.length ?? 0,
          settings: {
            colorMode: project.settings.colorMode ?? null,
            musicDriver: project.settings.musicDriver ?? null,
            cartType: project.settings.cartType ?? null,
          },
          validation: {
            valid: validation.valid,
            errorCount: validation.errors.length,
            warningCount: validation.warnings.length,
            errors: validation.errors,
            warnings: validation.warnings,
          },
        });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "find_unused_assets",
    {
      title: "Encontrar assets no referenciados",
      description:
        "Lista backgrounds, sprites, música y sonidos del proyecto que no están referenciados en ninguna escena o evento.",
      inputSchema: {
        projectPath: z.string(),
      },
    },
    async ({ projectPath }) => {
      try {
        const project = loadProject(projectPath);

        // Backgrounds usados en escenas
        const usedBgIds = new Set(
          project.scenes.map((s) => s.backgroundId).filter(Boolean) as string[]
        );

        // Sprites usados en actores + sprite del jugador en settings
        const usedSpriteIds = new Set<string>();
        for (const scene of project.scenes) {
          for (const actor of scene.actors) {
            if (actor.spriteSheetId) usedSpriteIds.add(actor.spriteSheetId);
          }
        }
        if (project.settings.playerSpriteSheetId) {
          usedSpriteIds.add(project.settings.playerSpriteSheetId);
        }
        // defaultPlayerSprites (por tipo de escena)
        for (const spriteId of Object.values(project.settings.defaultPlayerSprites ?? {})) {
          usedSpriteIds.add(spriteId);
        }

        // Música y sonidos referenciados en eventos (heurística en args JSON)
        const usedMusicIds = new Set<string>();
        const usedSoundIds = new Set<string>();
        walkProjectEvents(project, (evt) => {
          const str = JSON.stringify(evt.args ?? {});
          for (const m of str.matchAll(/"(?:music|musicId|song)":\s*"([^"]+)"/g)) {
            usedMusicIds.add(m[1]);
          }
          for (const m of str.matchAll(/"(?:sound|soundId|effect)":\s*"([^"]+)"/g)) {
            usedSoundIds.add(m[1]);
          }
        });

        const unusedBgs = (project.backgrounds ?? []).filter((b) => !usedBgIds.has(b.id));
        const unusedSprites = (project.spriteSheets ?? []).filter((s) => !usedSpriteIds.has(s.id));
        const unusedMusic = (project.music ?? []).filter((m) => !usedMusicIds.has(m.id));
        const unusedSounds = (project.sounds ?? []).filter((s) => !usedSoundIds.has(s.id));

        const slim = (arr: typeof unusedBgs) =>
          arr.map((a) => ({ id: a.id, name: a.name, filename: a.filename }));

        return ok({
          totalUnused:
            unusedBgs.length + unusedSprites.length + unusedMusic.length + unusedSounds.length,
          unusedBackgrounds: slim(unusedBgs),
          unusedSprites: slim(unusedSprites),
          unusedMusic: slim(unusedMusic),
          unusedSounds: slim(unusedSounds),
          note: "Los sonidos/música se detectan por heurística en args de eventos. Puede haber falsos positivos si se referencian de otra forma.",
        });
      } catch (e) {
        return err(String(e));
      }
    }
  );
}

function totalScriptEvents(scene: { actors?: Array<GBSSlottable>; triggers?: Array<GBSSlottable> } & GBSSlottable): number {
  const sceneSlots = ["script", "playerHitScript", "playerHit2Script", "playerHit3Script"];
  const actorSlots = ["script", "startScript", "updateScript", "hit1Script", "hit2Script", "hit3Script"];
  const triggerSlots = ["script", "leaveScript"];

  let count = 0;
  for (const slot of sceneSlots) {
    count += ((scene[slot] as GBSEvent[] | undefined) ?? []).length;
  }
  for (const actor of scene.actors ?? []) {
    for (const slot of actorSlots) {
      count += ((actor[slot] as GBSEvent[] | undefined) ?? []).length;
    }
  }
  for (const trigger of scene.triggers ?? []) {
    for (const slot of triggerSlots) {
      count += ((trigger[slot] as GBSEvent[] | undefined) ?? []).length;
    }
  }
  return count;
}
