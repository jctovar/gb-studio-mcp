import type { GBSProject, GBSScene, GBSActor, GBSTrigger, GBSEvent, GBSSlottable } from "../types/gbstudio.js";

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
  const sceneSlots = ["script", "playerHitScript", "playerHit2Script", "playerHit3Script"];
  const actorSlots = ["script", "startScript", "updateScript", "hit1Script", "hit2Script", "hit3Script"];
  const triggerSlots = ["script", "leaveScript"];

  for (const scene of project.scenes) {
    for (const slot of sceneSlots) {
      const evts = (scene as GBSSlottable)[slot] as GBSEvent[] | undefined;
      walkEvents(evts ?? [], cb, { sceneId: scene.id, slot });
    }
    for (const actor of scene.actors) {
      for (const slot of actorSlots) {
        const evts = (actor as GBSSlottable)[slot] as GBSEvent[] | undefined;
        walkEvents(evts ?? [], cb, { sceneId: scene.id, entityId: actor.id, slot });
      }
    }
    for (const trigger of scene.triggers) {
      for (const slot of triggerSlots) {
        const evts = (trigger as GBSSlottable)[slot] as GBSEvent[] | undefined;
        walkEvents(evts ?? [], cb, { sceneId: scene.id, entityId: trigger.id, slot });
      }
    }
  }
}
