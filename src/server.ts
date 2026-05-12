import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProjectTools } from "./tools/project.js";
import { registerSceneTools } from "./tools/scenes.js";
import { registerVariableTools } from "./tools/variables.js";
import { registerAssetTools } from "./tools/assets.js";
import { registerScriptTools } from "./tools/scripts.js";
import { registerSceneWriteTools } from "./tools/scenes-write.js";
import { registerScriptWriteTools } from "./tools/scripts-write.js";
import { registerVariableWriteTools } from "./tools/variables-write.js";
import { registerBuildTools } from "./tools/build.js";
import { registerAnalysisTools } from "./tools/analysis.js";
import { registerPrompts } from "./prompts/gbstudio-prompts.js";
import { registerResources } from "./resources/project-resource.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "gb-studio-mcp",
    version: "0.4.0",
  });

  // Fase 1 — solo lectura
  registerProjectTools(server);
  registerSceneTools(server);
  registerVariableTools(server);
  registerAssetTools(server);
  registerScriptTools(server);

  // Fase 2 — escritura
  registerSceneWriteTools(server);
  registerScriptWriteTools(server);
  registerVariableWriteTools(server);

  // Fase 3 — compilación
  registerBuildTools(server);

  // Fase 4 — análisis, prompts y recursos
  registerAnalysisTools(server);
  registerPrompts(server);
  registerResources(server);

  return server;
}
