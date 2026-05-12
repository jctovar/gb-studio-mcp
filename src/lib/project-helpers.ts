import type { GBSProject, GBSScene, GBSActor, GBSTrigger, GBSEvent, GBSSlottable } from "../types/gbstudio.js";
import { loadProject, saveProject } from "./gbsproj-parser.js";

// --- Constantes de slots de script por tipo de entidad ---
// Fuente única — usadas en walkProjectEvents, validateProject y los tools de scripts.

export const SCENE_SLOTS = [
  "script",
  "playerHitScript",
  "playerHit2Script",
  "playerHit3Script",
] as const;

export const ACTOR_SLOTS = [
  "script",
  "startScript",
  "updateScript",
  "hit1Script",
  "hit2Script",
  "hit3Script",
] as const;

export const TRIGGER_SLOTS = ["script", "leaveScript"] as const;

export const SLOTS_BY_TARGET: Record<"scene" | "actor" | "trigger", readonly string[]> = {
  scene: SCENE_SLOTS,
  actor: ACTOR_SLOTS,
  trigger: TRIGGER_SLOTS,
};

export type AnyEntity = GBSScene | GBSActor | GBSTrigger;
export type EntityKind = "scene" | "actor" | "trigger";

export function getSlot(entity: AnyEntity, slot: string): GBSEvent[] {
  return ((entity as GBSSlottable)[slot] as GBSEvent[] | undefined) ?? [];
}

export function setSlot(entity: AnyEntity, slot: string, events: GBSEvent[]): void {
  (entity as GBSSlottable)[slot] = events;
}

// --- Resolución de entidades ---

export function resolveScene(
  project: GBSProject,
  sceneId?: string,
  sceneName?: string
): GBSScene | undefined {
  if (!sceneId && !sceneName) return undefined;
  return project.scenes.find((s) => {
    if (sceneId) return s.id === sceneId;
    return s.name.toLowerCase().includes(sceneName!.toLowerCase());
  });
}

export function resolveActor(
  scene: GBSScene,
  entityId?: string,
  entityName?: string
): GBSActor | undefined {
  if (!entityId && !entityName) return undefined;
  return scene.actors.find((a) => {
    if (entityId) return a.id === entityId;
    return a.name.toLowerCase().includes(entityName!.toLowerCase());
  });
}

export function resolveTrigger(
  scene: GBSScene,
  entityId?: string,
  entityName?: string
): GBSTrigger | undefined {
  if (!entityId && !entityName) return undefined;
  return scene.triggers.find((t) => {
    if (entityId) return t.id === entityId;
    return t.name.toLowerCase().includes(entityName!.toLowerCase());
  });
}

// Resuelve una entidad (scene/actor/trigger) a partir de los args estándar de un tool.
// Devuelve la entidad y su escena, o un mensaje de error.
export function resolveTarget(
  project: GBSProject,
  target: EntityKind,
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

// --- Utilidades varias ---

export function toSymbol(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 64) || "unnamed"
  );
}

// Construye mapas id→name para escenas, actores y triggers en una sola pasada.
// Reutilizado por los tools de análisis.
export function buildEntityMaps(project: GBSProject): {
  scenes: Map<string, string>;
  actors: Map<string, string>;
  triggers: Map<string, string>;
} {
  const scenes = new Map<string, string>();
  const actors = new Map<string, string>();
  const triggers = new Map<string, string>();
  for (const scene of project.scenes) {
    scenes.set(scene.id, scene.name);
    for (const a of scene.actors) actors.set(a.id, a.name);
    for (const t of scene.triggers) triggers.set(t.id, t.name);
  }
  return { scenes, actors, triggers };
}

// --- Helpers recursivos para eventos ---

export function removeEventById(
  events: GBSEvent[],
  eventId: string
): { events: GBSEvent[]; removed: boolean } {
  const result: GBSEvent[] = [];
  let removed = false;
  for (const evt of events) {
    if (evt.id === eventId) {
      removed = true;
      continue;
    }
    if (evt.children) {
      const updatedChildren: Record<string, GBSEvent[]> = {};
      for (const [key, childEvts] of Object.entries(evt.children)) {
        const r = removeEventById(childEvts, eventId);
        updatedChildren[key] = r.events;
        if (r.removed) removed = true;
      }
      result.push({ ...evt, children: updatedChildren });
    } else {
      result.push(evt);
    }
  }
  return { events: result, removed };
}

export function updateEventArgs(
  events: GBSEvent[],
  eventId: string,
  newArgs: Record<string, unknown>
): { events: GBSEvent[]; updated: boolean } {
  const result: GBSEvent[] = [];
  let updated = false;
  for (const evt of events) {
    if (evt.id === eventId) {
      result.push({ ...evt, args: { ...(evt.args ?? {}), ...newArgs } });
      updated = true;
      continue;
    }
    if (evt.children) {
      const updatedChildren: Record<string, GBSEvent[]> = {};
      for (const [key, childEvts] of Object.entries(evt.children)) {
        const r = updateEventArgs(childEvts, eventId, newArgs);
        updatedChildren[key] = r.events;
        if (r.updated) updated = true;
      }
      result.push({ ...evt, children: updatedChildren });
    } else {
      result.push(evt);
    }
  }
  return { events: result, updated };
}

// Localiza el slot donde vive un evento en todo el proyecto.
// Devuelve null si no existe. Reemplaza los dobles bucles "outer:" duplicados.
export type EventLocation = {
  scene: GBSScene;
  entity: AnyEntity;
  entityKind: EntityKind;
  slot: string;
  events: GBSEvent[];
  describe: string;
};

export function findEventLocation(
  project: GBSProject,
  eventId: string
): EventLocation | null {
  const containsEventId = (events: GBSEvent[]): boolean => {
    for (const e of events) {
      if (e.id === eventId) return true;
      if (e.children) {
        for (const childEvts of Object.values(e.children)) {
          if (containsEventId(childEvts)) return true;
        }
      }
    }
    return false;
  };

  for (const scene of project.scenes) {
    for (const slot of SCENE_SLOTS) {
      const events = getSlot(scene, slot);
      if (containsEventId(events)) {
        return {
          scene,
          entity: scene,
          entityKind: "scene",
          slot,
          events,
          describe: `escena "${scene.name}" › ${slot}`,
        };
      }
    }
    for (const actor of scene.actors) {
      for (const slot of ACTOR_SLOTS) {
        const events = getSlot(actor, slot);
        if (containsEventId(events)) {
          return {
            scene,
            entity: actor,
            entityKind: "actor",
            slot,
            events,
            describe: `actor "${actor.name}" (escena "${scene.name}") › ${slot}`,
          };
        }
      }
    }
    for (const trigger of scene.triggers) {
      for (const slot of TRIGGER_SLOTS) {
        const events = getSlot(trigger, slot);
        if (containsEventId(events)) {
          return {
            scene,
            entity: trigger,
            entityKind: "trigger",
            slot,
            events,
            describe: `trigger "${trigger.name}" (escena "${scene.name}") › ${slot}`,
          };
        }
      }
    }
  }
  return null;
}

// --- Walk de eventos del proyecto ---

type EventCtx = { sceneId: string; entityId?: string; slot: string };

function walkEvents(
  events: GBSEvent[],
  cb: (evt: GBSEvent, ctx: EventCtx) => void,
  ctx: EventCtx
): void {
  for (const evt of events) {
    cb(evt, ctx);
    if (evt.children) {
      for (const childEvts of Object.values(evt.children)) {
        walkEvents(childEvts, cb, ctx);
      }
    }
  }
}

export function walkProjectEvents(
  project: GBSProject,
  cb: (evt: GBSEvent, ctx: EventCtx) => void
): void {
  for (const scene of project.scenes) {
    for (const slot of SCENE_SLOTS) {
      walkEvents(getSlot(scene, slot), cb, { sceneId: scene.id, slot });
    }
    for (const actor of scene.actors) {
      for (const slot of ACTOR_SLOTS) {
        walkEvents(getSlot(actor, slot), cb, { sceneId: scene.id, entityId: actor.id, slot });
      }
    }
    for (const trigger of scene.triggers) {
      for (const slot of TRIGGER_SLOTS) {
        walkEvents(getSlot(trigger, slot), cb, { sceneId: scene.id, entityId: trigger.id, slot });
      }
    }
  }
}

// --- Patrón load → mutar → save ---
// Encapsula el ciclo completo. La función mutator puede devolver datos para incluir
// en la respuesta del tool. Si lanza, no se guarda.
export function withProject<T>(projectPath: string, mutator: (p: GBSProject) => T): T {
  const project = loadProject(projectPath);
  const result = mutator(project);
  saveProject(projectPath, project);
  return result;
}
