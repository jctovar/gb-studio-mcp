import { z } from "zod";
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadProject, validateProject } from "../lib/gbsproj-parser.js";
import { ok, err, handler } from "../lib/mcp-response.js";

const BUILD_TARGETS = ["rom", "web"] as const;
type BuildTarget = (typeof BUILD_TARGETS)[number];
// 10 minutos — las builds de GB Studio pueden tardar bastante
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

function findCli(): { path: string } | { error: string } {
  try {
    // Intenta con el PATH estándar
    const found = execFileSync("which", ["gb-studio-cli"], { encoding: "utf-8" }).trim();
    return { path: found };
  } catch {
    // Intenta en node_modules local
    const localPath = resolve(process.cwd(), "node_modules/.bin/gb-studio-cli");
    if (existsSync(localPath)) return { path: localPath };
    return {
      error:
        "gb-studio-cli no encontrado. Instálalo con:\n  npm install -g @gbstudio/gb-studio-cli\no añade gb-studio al PATH.",
    };
  }
}

export function registerBuildTools(server: McpServer): void {
  server.registerTool(
    "build_project",
    {
      title: "Compilar proyecto GB Studio",
      description: [
        "Compila el proyecto usando gb-studio-cli.",
        "target=rom genera una ROM .gb para emuladores y cartuchos.",
        "target=web genera una versión jugable en navegador.",
        "Valida el proyecto automáticamente antes de compilar (desactivable con validateFirst=false).",
        "NOTA: las builds pueden tardar varios minutos; el servidor espera hasta 10 minutos.",
      ].join(" "),
      inputSchema: {
        projectPath: z.string().describe("Ruta al archivo .gbsproj"),
        target: z.enum(BUILD_TARGETS).optional().describe("Tipo de build: rom (defecto) o web"),
        outputDir: z.string().optional().describe("Directorio de salida (defecto: <proyecto>/build/)"),
        validateFirst: z
          .boolean()
          .optional()
          .describe("Validar el proyecto antes de compilar (defecto: true)"),
      },
    },
    handler(async ({ projectPath, target, outputDir, validateFirst }: {
      projectPath: string; target?: BuildTarget; outputDir?: string; validateFirst?: boolean;
    }) => {
      // 1. Verificar gb-studio-cli
      const cli = findCli();
      if ("error" in cli) return err(cli.error);

      // 2. Verificar que el proyecto existe
      const resolvedProject = resolve(projectPath);
      if (!existsSync(resolvedProject)) {
        return err(`Proyecto no encontrado: ${resolvedProject}`);
      }

      // 3. Validación pre-build (activada por defecto)
      if (validateFirst !== false) {
        const project = loadProject(resolvedProject);
        const validation = validateProject(project);
        if (!validation.valid) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: "El proyecto no pasó la validación pre-build. Corrije los errores antes de compilar.",
                validation,
              }, null, 2),
            }],
            isError: true,
          };
        }
        if (validation.warnings.length > 0) {
          console.error(
            `[gb-studio-mcp] Advertencias de validación:\n${validation.warnings.map((w) => `  - ${w}`).join("\n")}`
          );
        }
      }

      // 4. Preparar directorio de salida — rutas relativas se anclan al directorio del proyecto
      const buildTarget = target ?? "rom";
      const projectDir = dirname(resolvedProject);
      const resolvedOutput = outputDir
        ? isAbsolute(outputDir) ? outputDir : resolve(projectDir, outputDir)
        : resolve(projectDir, "build");

      mkdirSync(resolvedOutput, { recursive: true });

      // 5. Ejecutar build
      const command = buildTarget === "rom" ? "make:rom" : "make:web";
      console.error(`[gb-studio-mcp] Iniciando build ${buildTarget.toUpperCase()}: ${cli.path} ${command} ...`);

      const startMs = Date.now();
      const result = spawnSync(
        cli.path,
        [command, resolvedProject, resolvedOutput],
        { encoding: "utf-8", timeout: BUILD_TIMEOUT_MS }
      );
      const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

      if (result.error) {
        const isTimeout = result.error.message.includes("ETIMEDOUT") || result.error.message.includes("timeout");
        return err(
          isTimeout
            ? `Build superó el timeout de ${BUILD_TIMEOUT_MS / 60000} minutos`
            : `Error al ejecutar gb-studio-cli: ${result.error.message}`
        );
      }

      if (result.status !== 0) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              exitCode: result.status,
              elapsedSeconds: Number(elapsedSec),
              stdout: result.stdout?.trim() || null,
              stderr: result.stderr?.trim() || null,
            }, null, 2),
          }],
          isError: true,
        };
      }

      return ok({
        success: true,
        target: buildTarget,
        outputDir: resolvedOutput,
        elapsedSeconds: Number(elapsedSec),
        stdout: result.stdout?.trim() || null,
      });
    })
  );

  server.registerTool(
    "check_build_tools",
    {
      title: "Verificar herramientas de compilación",
      description:
        "Verifica si gb-studio-cli está disponible, muestra su versión y valida el proyecto si se proporciona.",
      inputSchema: {
        projectPath: z
          .string()
          .optional()
          .describe("Ruta al proyecto para validarlo también (opcional)"),
      },
    },
    handler(async ({ projectPath }: { projectPath?: string }) => {
      const info: Record<string, unknown> = {};

      // Node.js
      info.nodeVersion = process.version;
      info.platform = process.platform;

      // gb-studio-cli
      const cli = findCli();
      if ("error" in cli) {
        info.gbStudioCli = { available: false, error: cli.error };
      } else {
        info.gbStudioCli = { available: true, path: cli.path };
        try {
          const versionResult = spawnSync(cli.path, ["--version"], { encoding: "utf-8", timeout: 5000 });
          info.gbStudioCli = {
            ...info.gbStudioCli as object,
            version: versionResult.stdout?.trim() || versionResult.stderr?.trim() || "desconocida",
          };
        } catch {
          (info.gbStudioCli as Record<string, unknown>).version = "no se pudo obtener";
        }
      }

      // Validación del proyecto (opcional)
      if (projectPath) {
        try {
          const project = loadProject(projectPath);
          const validation = validateProject(project);
          info.project = {
            name: project.name,
            version: project._version,
            scenes: project.scenes.length,
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
          };
        } catch (e) {
          info.projectError = String(e);
        }
      }

      return ok(info);
    })
  );
}
