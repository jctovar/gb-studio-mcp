import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject, saveProject } from "../lib/gbsproj-parser.js";
import { toSymbol, walkProjectEvents } from "../lib/project-helpers.js";

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const err = (msg: string) => ({
  content: [{ type: "text" as const, text: `Error: ${msg}` }],
  isError: true as const,
});

export function registerVariableWriteTools(server: McpServer): void {
  server.registerTool(
    "create_variable",
    {
      title: "Crear variable global",
      description: "Crea una nueva variable global en el proyecto con ID numérico auto-asignado.",
      inputSchema: {
        projectPath: z.string(),
        name: z.string().describe("Nombre de la variable"),
        symbol: z.string().optional().describe("Símbolo de compilación (se genera automáticamente si no se especifica)"),
      },
    },
    async ({ projectPath, name, symbol }) => {
      try {
        const project = loadProject(projectPath);

        const maxId = project.variables.reduce(
          (max, v) => Math.max(max, parseInt(v.id, 10) || 0),
          -1
        );
        const newVar = {
          id: String(maxId + 1),
          name,
          symbol: symbol ?? `var_${toSymbol(name)}`,
        };
        project.variables.push(newVar);
        saveProject(projectPath, project);
        return ok({ created: true, variable: newVar });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "rename_variable",
    {
      title: "Renombrar variable global",
      description: "Cambia el nombre y/o símbolo de una variable global existente.",
      inputSchema: {
        projectPath: z.string(),
        variableId: z.string().optional().describe("ID numérico de la variable"),
        variableName: z.string().optional().describe("Nombre actual de la variable (búsqueda parcial)"),
        newName: z.string().describe("Nuevo nombre"),
        newSymbol: z.string().optional().describe("Nuevo símbolo (se genera automáticamente si no se especifica)"),
      },
    },
    async ({ projectPath, variableId, variableName, newName, newSymbol }) => {
      try {
        if (!variableId && !variableName) return err("Debes proporcionar variableId o variableName");
        const project = loadProject(projectPath);

        const variable = project.variables.find((v) => {
          if (variableId) return v.id === variableId;
          return v.name.toLowerCase().includes(variableName!.toLowerCase());
        });
        if (!variable) return err(`Variable no encontrada: ${variableId ?? variableName}`);

        const oldName = variable.name;
        variable.name = newName;
        variable.symbol = newSymbol ?? `var_${toSymbol(newName)}`;
        saveProject(projectPath, project);
        return ok({ updated: true, variable, oldName });
      } catch (e) {
        return err(String(e));
      }
    }
  );

  server.registerTool(
    "list_variable_usages",
    {
      title: "Encontrar usos de una variable",
      description: "Busca en todos los scripts del proyecto los eventos que referencian una variable global.",
      inputSchema: {
        projectPath: z.string(),
        variableId: z.string().optional().describe("ID de la variable"),
        variableName: z.string().optional().describe("Nombre de la variable (búsqueda parcial)"),
      },
    },
    async ({ projectPath, variableId, variableName }) => {
      try {
        if (!variableId && !variableName) return err("Debes proporcionar variableId o variableName");
        const project = loadProject(projectPath);

        const variable = project.variables.find((v) => {
          if (variableId) return v.id === variableId;
          return v.name.toLowerCase().includes(variableName!.toLowerCase());
        });
        if (!variable) return err(`Variable no encontrada: ${variableId ?? variableName}`);

        const usages: Array<{
          eventId: string;
          command: string;
          sceneId: string;
          entityId?: string;
          slot: string;
        }> = [];

        // Busca el ID de la variable como string JSON (ej: "0" → matches "variable":"0")
        const searchStr = `"${variable.id}"`;
        walkProjectEvents(project, (evt, ctx) => {
          if (JSON.stringify(evt.args ?? {}).includes(searchStr)) {
            usages.push({
              eventId: evt.id,
              command: evt.command,
              sceneId: ctx.sceneId,
              entityId: ctx.entityId,
              slot: ctx.slot,
            });
          }
        });

        return ok({ variable, usageCount: usages.length, usages });
      } catch (e) {
        return err(String(e));
      }
    }
  );
}
