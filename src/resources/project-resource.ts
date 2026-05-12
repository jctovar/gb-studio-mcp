import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject } from "../lib/gbsproj-parser.js";

const PROJECT_PATH = process.env["GBS_PROJECT_PATH"];

export function registerResources(server: McpServer): void {
  if (!PROJECT_PATH) {
    console.error(
      "[gb-studio-mcp] GBS_PROJECT_PATH no configurado — recursos MCP desactivados.\n" +
        "  Configura la variable de entorno para activarlos:\n" +
        "  export GBS_PROJECT_PATH=/ruta/a/proyecto.gbsproj"
    );
    return;
  }

  // Resource fijo: metadatos del proyecto
  server.registerResource(
    "project-info",
    "gbstudio://project/info",
    {
      title: "Información del proyecto GB Studio",
      description:
        "Metadatos del proyecto activo: nombre, versión, conteos de escenas, actores, variables y assets.",
      mimeType: "application/json",
    },
    async () => {
      const project = loadProject(PROJECT_PATH);
      const totalActors = project.scenes.reduce((n, s) => n + (s.actors?.length ?? 0), 0);
      const totalTriggers = project.scenes.reduce((n, s) => n + (s.triggers?.length ?? 0), 0);

      return {
        contents: [
          {
            uri: "gbstudio://project/info",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                name: project.name,
                version: project._version,
                author: project.author ?? null,
                counts: {
                  scenes: project.scenes.length,
                  actors: totalActors,
                  triggers: totalTriggers,
                  variables: project.variables.length,
                  backgrounds: project.backgrounds?.length ?? 0,
                  sprites: project.spriteSheets?.length ?? 0,
                  music: project.music?.length ?? 0,
                },
                settings: {
                  colorMode: project.settings.colorMode ?? null,
                  musicDriver: project.settings.musicDriver ?? null,
                  cartType: project.settings.cartType ?? null,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Resource con template: detalle de escena por ID
  server.registerResource(
    "scene",
    new ResourceTemplate("gbstudio://scenes/{sceneId}", { list: undefined }),
    {
      title: "Detalle de escena GB Studio",
      description: "Actores, triggers y metadata de una escena por su ID.",
      mimeType: "application/json",
    },
    async (uri, { sceneId }) => {
      const project = loadProject(PROJECT_PATH);
      const scene = project.scenes.find((s) => s.id === String(sceneId));

      const text = scene
        ? JSON.stringify(
            {
              id: scene.id,
              name: scene.name,
              type: scene.type ?? "topDown",
              width: scene.width,
              height: scene.height,
              backgroundId: scene.backgroundId,
              actors: scene.actors.map((a) => ({
                id: a.id,
                name: a.name,
                x: a.x,
                y: a.y,
                spriteSheetId: a.spriteSheetId ?? null,
                movementType: a.movementType ?? null,
              })),
              triggers: scene.triggers.map((t) => ({
                id: t.id,
                name: t.name,
                x: t.x,
                y: t.y,
                width: t.width,
                height: t.height,
              })),
            },
            null,
            2
          )
        : JSON.stringify({ error: `Escena no encontrada: ${sceneId}` });

      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text }],
      };
    }
  );

  // Resource con template: variables del proyecto
  server.registerResource(
    "variables",
    "gbstudio://variables",
    {
      title: "Variables globales del proyecto",
      description: "Lista de todas las variables globales con su ID, nombre y símbolo.",
      mimeType: "application/json",
    },
    async () => {
      const project = loadProject(PROJECT_PATH);
      return {
        contents: [
          {
            uri: "gbstudio://variables",
            mimeType: "application/json",
            text: JSON.stringify(project.variables, null, 2),
          },
        ],
      };
    }
  );
}
