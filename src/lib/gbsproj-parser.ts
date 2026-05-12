import fs from "fs";
import path from "path";
import type { GBSProject, GBSEvent, GBSSlottable, ValidationResult } from "../types/gbstudio.js";

const SUPPORTED_VERSIONS = ["4.0", "4.1", "4.2", "4.3", "4.4", "4.5"];

// GB Studio limits
const MAX_ACTORS_PER_SCENE = 30;
const MAX_TRIGGERS_PER_SCENE = 30;

const MAX_PROJECT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export function loadProject(projectPath: string): GBSProject {
  const resolved = path.resolve(projectPath);

  if (path.extname(resolved) !== ".gbsproj") {
    throw new Error(`La ruta debe apuntar a un archivo .gbsproj (recibido: ${path.basename(resolved)})`);
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`Proyecto no encontrado: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (stat.size > MAX_PROJECT_SIZE_BYTES) {
    throw new Error(`El archivo supera el límite de tamaño permitido (${MAX_PROJECT_SIZE_BYTES / 1024 / 1024} MB)`);
  }

  const raw = fs.readFileSync(resolved, "utf-8");
  let project: GBSProject;
  try {
    project = JSON.parse(raw) as GBSProject;
  } catch (e) {
    throw new Error(`Error al parsear el archivo .gbsproj: ${String(e)}`);
  }

  const majorMinor = project._version?.split(".").slice(0, 2).join(".");
  if (!SUPPORTED_VERSIONS.includes(majorMinor)) {
    console.error(
      `[gb-studio-mcp] Advertencia: versión ${project._version} no verificada. Se esperaba GB Studio 4.x`
    );
  }

  return project;
}

export function saveProject(projectPath: string, project: GBSProject): void {
  const resolved = path.resolve(projectPath);

  if (path.extname(resolved) !== ".gbsproj") {
    throw new Error(`La ruta debe apuntar a un archivo .gbsproj (recibido: ${path.basename(resolved)})`);
  }

  const backupPath = `${resolved}.bak`;
  if (fs.existsSync(resolved)) {
    fs.copyFileSync(resolved, backupPath);
  }

  const tmpPath = `${resolved}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(project, null, 2), "utf-8");
  fs.renameSync(tmpPath, resolved);

  console.error(`[gb-studio-mcp] Proyecto guardado: ${resolved}`);
}

// Extrae IDs de variables referenciadas en los args de un evento y sus hijos
function collectVariableRefs(events: GBSEvent[] | undefined, out: Set<string>): void {
  if (!events) return;
  for (const evt of events) {
    const argsStr = JSON.stringify(evt.args ?? {});
    // Captura patrones como "variable":"0" o "variableId":"2"
    for (const m of argsStr.matchAll(/"(?:variable|variableId)":\s*"([^"]+)"/g)) {
      out.add(m[1]);
    }
    if (evt.children) {
      for (const childEvts of Object.values(evt.children)) {
        collectVariableRefs(childEvts, out);
      }
    }
  }
}

export function validateProject(project: GBSProject): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Estructura básica ---
  if (!project._version) errors.push("Falta el campo _version");
  if (!project.name) errors.push("Falta el campo name");
  if (!Array.isArray(project.scenes)) errors.push("El campo scenes debe ser un array");
  if (!Array.isArray(project.variables)) errors.push("El campo variables debe ser un array");

  const bgIds = new Set((project.backgrounds ?? []).map((b) => b.id));
  const spriteIds = new Set((project.spriteSheets ?? []).map((s) => s.id));
  const sceneIds = new Set((project.scenes ?? []).map((s) => s.id));
  const variableIds = new Set((project.variables ?? []).map((v) => v.id));

  // --- Escena inicial ---
  if (project.settings?.startSceneId && !sceneIds.has(project.settings.startSceneId)) {
    errors.push(`Escena inicial (startSceneId: "${project.settings.startSceneId}") no existe en el proyecto`);
  }
  if (!project.settings?.startSceneId && (project.scenes?.length ?? 0) > 0) {
    warnings.push("No hay escena inicial configurada (settings.startSceneId vacío)");
  }

  // --- Backgrounds: dimensiones múltiplo de 8 ---
  for (const bg of project.backgrounds ?? []) {
    if (bg.imageWidth !== undefined && bg.imageWidth % 8 !== 0) {
      errors.push(`Background "${bg.name}": ancho ${bg.imageWidth}px no es múltiplo de 8`);
    }
    if (bg.imageHeight !== undefined && bg.imageHeight % 8 !== 0) {
      errors.push(`Background "${bg.name}": alto ${bg.imageHeight}px no es múltiplo de 8`);
    }
    // Tamaño máximo de escena: 32x32 tiles = 256x256px
    if (bg.imageWidth !== undefined && bg.imageWidth > 256) {
      errors.push(`Background "${bg.name}": ancho ${bg.imageWidth}px supera el máximo de 256px (32 tiles)`);
    }
    if (bg.imageHeight !== undefined && bg.imageHeight > 256) {
      errors.push(`Background "${bg.name}": alto ${bg.imageHeight}px supera el máximo de 256px (32 tiles)`);
    }
  }

  // --- Escenas ---
  const referencedVarIds = new Set<string>();

  for (const scene of project.scenes ?? []) {
    if (!scene.id) errors.push(`Escena sin ID: "${scene.name}"`);
    if (!scene.name) warnings.push(`Escena ${scene.id} sin nombre`);

    if (!scene.backgroundId) {
      warnings.push(`Escena "${scene.name}" no tiene background asignado`);
    } else if (!bgIds.has(scene.backgroundId)) {
      errors.push(`Escena "${scene.name}" referencia background inexistente: ${scene.backgroundId}`);
    }

    // Límite de actores
    const actorCount = scene.actors?.length ?? 0;
    if (actorCount > MAX_ACTORS_PER_SCENE) {
      warnings.push(`Escena "${scene.name}" tiene ${actorCount} actores (límite GB Studio: ${MAX_ACTORS_PER_SCENE})`);
    }

    // Límite de triggers
    const triggerCount = scene.triggers?.length ?? 0;
    if (triggerCount > MAX_TRIGGERS_PER_SCENE) {
      warnings.push(`Escena "${scene.name}" tiene ${triggerCount} triggers (límite: ${MAX_TRIGGERS_PER_SCENE})`);
    }

    // --- Actores ---
    for (const actor of scene.actors ?? []) {
      if (!actor.id) errors.push(`Actor sin ID en escena "${scene.name}"`);
      if (!actor.name) warnings.push(`Actor sin nombre en escena "${scene.name}"`);

      // Bounds: actor fuera del mapa
      if (actor.x >= scene.width || actor.y >= scene.height) {
        errors.push(
          `Actor "${actor.name}" (escena "${scene.name}") fuera de límites: pos(${actor.x},${actor.y}) > tamaño(${scene.width}×${scene.height})`
        );
      }

      if (actor.spriteSheetId && !spriteIds.has(actor.spriteSheetId)) {
        warnings.push(`Actor "${actor.name}" (escena "${scene.name}") referencia sprite inexistente: ${actor.spriteSheetId}`);
      }

      // Recoger referencias a variables en todos los slots del actor
      for (const slot of ["script", "startScript", "updateScript", "hit1Script", "hit2Script", "hit3Script"]) {
        collectVariableRefs((actor as GBSSlottable)[slot] as GBSEvent[] | undefined, referencedVarIds);
      }
    }

    // --- Triggers ---
    for (const trigger of scene.triggers ?? []) {
      if (!trigger.id) errors.push(`Trigger sin ID en escena "${scene.name}"`);

      // Bounds: trigger parcialmente fuera del mapa
      if (
        trigger.x >= scene.width ||
        trigger.y >= scene.height ||
        trigger.x + trigger.width > scene.width ||
        trigger.y + trigger.height > scene.height
      ) {
        warnings.push(
          `Trigger "${trigger.name}" (escena "${scene.name}") fuera de límites: rect(${trigger.x},${trigger.y},${trigger.width}×${trigger.height}) > tamaño(${scene.width}×${scene.height})`
        );
      }

      for (const slot of ["script", "leaveScript"]) {
        collectVariableRefs((trigger as GBSSlottable)[slot] as GBSEvent[] | undefined, referencedVarIds);
      }
    }

    // Scripts de escena
    for (const slot of ["script", "playerHitScript", "playerHit2Script", "playerHit3Script"]) {
      collectVariableRefs((scene as GBSSlottable)[slot] as GBSEvent[] | undefined, referencedVarIds);
    }
  }

  // --- Variables referenciadas pero no declaradas ---
  for (const varId of referencedVarIds) {
    if (!variableIds.has(varId)) {
      warnings.push(`Variable ID "${varId}" referenciada en eventos pero no declarada en project.variables`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
