import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject } from "../lib/gbsproj-parser.js";
import { toSymbol, walkProjectEvents, withProject } from "../lib/project-helpers.js";
import { ok, err, handler } from "../lib/mcp-response.js";

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
    handler(async ({ projectPath, name, symbol }: { projectPath: string; name: string; symbol?: string }) => {
      const newVar = withProject(projectPath, (project) => {
        const maxId = project.variables.reduce(
          (max, v) => Math.max(max, parseInt(v.id, 10) || 0),
          -1
        );
        const v = {
          id: String(maxId + 1),
          name,
          symbol: symbol ?? `var_${toSymbol(name)}`,
        };
        project.variables.push(v);
        return v;
      });
      return ok({ created: true, variable: newVar });
    })
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
    handler(async ({ projectPath, variableId, variableName, newName, newSymbol }: {
      projectPath: string; variableId?: string; variableName?: string;
      newName: string; newSymbol?: string;
    }) => {
      if (!variableId && !variableName) return err("Debes proporcionar variableId o variableName");
      const result = withProject(projectPath, (project): { kind: "err" } | { kind: "ok"; variable: { id: string; name: string; symbol: string }; oldName: string } => {
        const variable = project.variables.find((v) => {
          if (variableId) return v.id === variableId;
          return v.name.toLowerCase().includes(variableName!.toLowerCase());
        });
        if (!variable) return { kind: "err" };
        const oldName = variable.name;
        variable.name = newName;
        variable.symbol = newSymbol ?? `var_${toSymbol(newName)}`;
        return { kind: "ok", variable: { id: variable.id, name: variable.name, symbol: variable.symbol }, oldName };
      });
      if (result.kind === "err") return err(`Variable no encontrada: ${variableId ?? variableName}`);
      return ok({ updated: true, variable: result.variable, oldName: result.oldName });
    })
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
    handler(async ({ projectPath, variableId, variableName }: {
      projectPath: string; variableId?: string; variableName?: string;
    }) => {
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
    })
  );
}
