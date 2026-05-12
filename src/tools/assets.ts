import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject } from "../lib/gbsproj-parser.js";

const ASSET_TYPES = ["backgrounds", "sprites", "music", "sounds", "fonts"] as const;
type AssetType = (typeof ASSET_TYPES)[number];

export function registerAssetTools(server: McpServer): void {
  server.registerTool(
    "list_assets",
    {
      title: "Listar assets del proyecto",
      description:
        "Lista los assets disponibles del proyecto: backgrounds, sprites, música, sonidos y fuentes. Se puede filtrar por tipo.",
      inputSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
        type: z
          .enum(ASSET_TYPES)
          .optional()
          .describe(
            "Tipo de asset a listar. Si se omite, retorna todos los tipos."
          ),
      },
    },
    async ({ projectPath, type }) => {
      try {
        const project = loadProject(projectPath);

        const collect = (assetType: AssetType) => {
          switch (assetType) {
            case "backgrounds":
              return (project.backgrounds ?? []).map((b) => ({
                id: b.id,
                name: b.name,
                filename: b.filename,
                width: b.width ?? null,
                height: b.height ?? null,
                symbol: b.symbol ?? null,
              }));
            case "sprites":
              return (project.spriteSheets ?? []).map((s) => ({
                id: s.id,
                name: s.name,
                filename: s.filename,
                type: s.type ?? null,
                symbol: s.symbol ?? null,
              }));
            case "music":
              return (project.music ?? []).map((m) => ({
                id: m.id,
                name: m.name,
                filename: m.filename,
                type: m.type ?? null,
                symbol: m.symbol ?? null,
              }));
            case "sounds":
              return (project.sounds ?? []).map((s) => ({
                id: s.id,
                name: s.name,
                filename: s.filename,
                type: s.type ?? null,
                symbol: s.symbol ?? null,
              }));
            case "fonts":
              return (project.fonts ?? []).map((f) => ({
                id: f.id,
                name: f.name,
                filename: f.filename,
                symbol: f.symbol ?? null,
              }));
          }
        };

        let result: Record<string, unknown>;

        if (type) {
          result = { [type]: collect(type) };
        } else {
          result = Object.fromEntries(
            ASSET_TYPES.map((t) => [t, collect(t)])
          );
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
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
