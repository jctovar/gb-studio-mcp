import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "design_rpg_scene",
    {
      title: "Diseñar escena RPG completa",
      description:
        "Guía paso a paso para crear una escena RPG estándar con NPCs, triggers de salida y diálogos.",
      argsSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
        sceneName: z.string().describe("Nombre de la nueva escena"),
        backgroundId: z
          .string()
          .optional()
          .describe("ID del background a usar (usa list_assets si no lo sabes)"),
      },
    },
    async ({ projectPath, sceneName, backgroundId }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Crea una escena RPG completa llamada "${sceneName}" en el proyecto: ${projectPath}`,
              "",
              "## Pasos a seguir en orden",
              "",
              "### 1. Preparación",
              backgroundId
                ? `El background a usar tiene ID: \`${backgroundId}\``
                : "Primero llama a `list_assets` con `type: \"backgrounds\"` para ver los backgrounds disponibles y elige uno.",
              "",
              "### 2. Crear la escena",
              "Llama a `create_scene` con:",
              `- name: "${sceneName}"`,
              "- type: \"topDown\"",
              "- width: 20, height: 18",
              backgroundId ? `- backgroundId: "${backgroundId}"` : "- backgroundId: <el que elegiste>",
              "",
              "### 3. Añadir NPCs",
              "Añade al menos 2 actores con `create_actor`:",
              "- **NPC guardián**: movementType \"none\", direction \"down\", en posición central del mapa",
              "- **NPC transeúnte**: movementType \"random\", para dar vida a la escena",
              "Añade diálogo a cada uno con `set_dialogue`.",
              "",
              "### 4. Añadir trigger de salida",
              "Crea un trigger en el borde del mapa con `create_trigger`:",
              "- x: 9, y: 0, width: 2, height: 1 (borde norte)",
              "Luego usa `add_scene_transition` en ese trigger para conectar con otra escena.",
              "(Usa `list_scenes` para ver qué escenas existen y obtener su ID.)",
              "",
              "### 5. Verificar",
              "Llama a `get_scene` para confirmar que la escena quedó correctamente.",
              "Llama a `validate_project` para verificar que no hay errores.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "add_npc_dialogue",
    {
      title: "Añadir NPC con diálogo",
      description:
        "Crea un NPC con un diálogo de interacción. Soporta texto simple o multi-página.",
      argsSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
        sceneName: z.string().describe("Escena donde añadir el NPC"),
        npcName: z.string().describe("Nombre del personaje"),
        dialogue: z.string().describe("Texto principal del diálogo del NPC"),
      },
    },
    async ({ projectPath, sceneName, npcName, dialogue }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Añade un NPC llamado "${npcName}" en la escena "${sceneName}" con el siguiente diálogo:`,
              `"${dialogue}"`,
              "",
              `Proyecto: ${projectPath}`,
              "",
              "## Pasos",
              "",
              "### 1. Examinar la escena",
              `Llama a \`get_scene\` con sceneName: "${sceneName}" para ver:`,
              "- El ID de la escena (lo necesitarás)",
              "- Las dimensiones (width, height) para saber dónde colocar el actor",
              "- Los actores existentes para no superponerte",
              "",
              "### 2. Elegir sprite",
              "Llama a `list_assets` con type: \"sprites\" y elige un sprite adecuado para el NPC.",
              "",
              `### 3. Crear el actor`,
              "Llama a `create_actor` con:",
              `- name: "${npcName}"`,
              "- sceneId: <ID de la escena>",
              "- x, y: una posición libre en el mapa",
              "- movementType: \"none\"",
              "- direction: \"down\"",
              "- spriteSheetId: <el sprite elegido>",
              "",
              "### 4. Añadir el diálogo",
              "Llama a `set_dialogue` con:",
              "- target: \"actor\"",
              "- sceneId: <ID de la escena>",
              "- entityId: <ID del nuevo actor>",
              `- text: "${dialogue}"`,
              "",
              "### 5. Verificar",
              "Llama a `get_script` con target: \"actor\" para confirmar que el script se guardó.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "setup_scene_transition",
    {
      title: "Conectar dos escenas",
      description:
        "Crea triggers de transición bidireccionales entre dos escenas usando EVENT_SWITCH_SCENE.",
      argsSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
        sceneAName: z.string().describe("Nombre de la primera escena"),
        sceneBName: z.string().describe("Nombre de la segunda escena"),
      },
    },
    async ({ projectPath, sceneAName, sceneBName }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Conecta las escenas "${sceneAName}" y "${sceneBName}" con transiciones bidireccionales.`,
              "",
              `Proyecto: ${projectPath}`,
              "",
              "## Pasos",
              "",
              "### 1. Obtener datos de ambas escenas",
              `Llama a \`get_scene\` con sceneName: "${sceneAName}" → anota su ID y dimensiones.`,
              `Llama a \`get_scene\` con sceneName: "${sceneBName}" → anota su ID y dimensiones.`,
              "",
              `### 2. Trigger de salida en "${sceneAName}"`,
              "Llama a `create_trigger` con:",
              `- sceneName: "${sceneAName}"`,
              `- name: "Salida a ${sceneBName}"`,
              "- x: 9, y: 0, width: 2, height: 1  (borde norte — ajusta según el diseño)",
              "",
              "Luego `add_scene_transition` en ese trigger:",
              "- target: \"trigger\"",
              `- sceneName: "${sceneAName}"`,
              "- entityId: <ID del trigger creado>",
              `- targetSceneId: <ID de "${sceneBName}">`,
              `- targetX: 9, targetY: <height de "${sceneBName}" - 2>  (borde sur de la escena destino)`,
              "- direction: \"down\"",
              "",
              `### 3. Trigger de retorno en "${sceneBName}"`,
              "Llama a `create_trigger` con:",
              `- sceneName: "${sceneBName}"`,
              `- name: "Salida a ${sceneAName}"`,
              `- x: 9, y: <height - 1>, width: 2, height: 1  (borde sur)`,
              "",
              "Luego `add_scene_transition` en ese trigger:",
              "- target: \"trigger\"",
              `- sceneName: "${sceneBName}"`,
              "- entityId: <ID del trigger creado>",
              `- targetSceneId: <ID de "${sceneAName}">`,
              "- targetX: 9, targetY: 1  (borde norte de la escena origen)",
              "- direction: \"up\"",
              "",
              "### 4. Verificar conexiones",
              "Llama a `find_scene_connections` para confirmar el grafo.",
            ].join("\n"),
          },
        },
      ],
    })
  );
}
