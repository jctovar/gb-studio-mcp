# Plan: MCP Server para GB Studio

> **Objetivo:** Implementar un servidor MCP (Model Context Protocol) que permita a Claude y otros LLMs leer, analizar y modificar proyectos de GB Studio directamente, sin necesidad de abrir la GUI.

---

## Contexto y Viabilidad

### ¿Por qué es posible?

GB Studio almacena sus proyectos en un archivo `.gbsproj` que es puro **JSON** con estructura bien definida. Además:

- Existe un **CLI oficial** (`gb-studio-cli`) para compilar proyectos headless
- Los scripts de escenas/actores/triggers se almacenan en archivos `.gbsres` (también JSON)
- El sistema de plugins expone una **API JavaScript** para crear eventos personalizados
- El engine usa **GBVM** (Game Boy Virtual Machine) con instrucciones documentadas

### Enfoque de integración

El MCP operará como un **servidor stdio local** que lee y manipula archivos del proyecto directamente en disco. No requiere que GB Studio esté abierto.

---

## Arquitectura General

```
Claude / LLM
     │
     │  MCP Protocol (stdio/JSON-RPC)
     ▼
┌─────────────────────────┐
│   gb-studio-mcp-server  │
│   (Node.js + TypeScript) │
│                         │
│  ┌─────────┐ ┌────────┐ │
│  │ Tools   │ │Resources│ │
│  └─────────┘ └────────┘ │
└────────────┬────────────┘
             │ fs / child_process
             ▼
┌─────────────────────────┐
│   Proyecto GB Studio    │
│   ├── project.gbsproj   │
│   ├── assets/           │
│   ├── plugins/          │
│   └── build/            │
└─────────────────────────┘
```

---

## Estructura del Repositorio

```
gb-studio-mcp/
├── src/
│   ├── index.ts              # Entry point, setup del servidor MCP
│   ├── server.ts             # McpServer con registro de tools/resources
│   ├── tools/
│   │   ├── project.ts        # Leer/escribir proyecto
│   │   ├── scenes.ts         # CRUD de escenas
│   │   ├── actors.ts         # CRUD de actores
│   │   ├── scripts.ts        # Leer/escribir scripts (eventos)
│   │   ├── variables.ts      # Gestión de variables globales
│   │   ├── build.ts          # Compilar ROM via gb-studio-cli
│   │   └── assets.ts         # Listar assets del proyecto
│   ├── resources/
│   │   ├── project-resource.ts
│   │   └── scene-resource.ts
│   ├── lib/
│   │   ├── gbsproj-parser.ts  # Parsear y mutar el .gbsproj
│   │   ├── gbsres-parser.ts   # Parsear archivos .gbsres (scripts)
│   │   └── gbvm-helpers.ts    # Helpers para generar instrucciones GBVM
│   └── types/
│       └── gbstudio.d.ts      # Tipos TypeScript del proyecto GBS
├── tests/
│   ├── fixtures/              # Proyectos GBS de ejemplo para tests
│   └── *.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Fases de Implementación

### Fase 1 — Fundación (Semana 1-2)

**Meta:** Servidor MCP funcional con acceso de solo lectura.

#### 1.1 Setup del proyecto

```bash
mkdir gb-studio-mcp && cd gb-studio-mcp
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node tsx
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true
  }
}
```

#### 1.2 Parser del `.gbsproj`

El archivo `.gbsproj` tiene esta forma:

```json
{
  "_version": "4.2.0",
  "name": "Mi Juego",
  "settings": { ... },
  "scenes": [
    {
      "id": "uuid",
      "name": "Intro",
      "backgroundId": "uuid",
      "width": 20,
      "height": 18,
      "actors": [ { "id": "...", "name": "NPC1", "x": 5, "y": 8, ... } ],
      "triggers": [ ... ],
      "script": [ /* array de eventos */ ]
    }
  ],
  "variables": [ { "id": "0", "name": "score", "symbol": "var_score" } ],
  "customEvents": [ ... ],
  "spriteSheets": [ ... ],
  "backgrounds": [ ... ],
  "music": [ ... ]
}
```

Implementar en `lib/gbsproj-parser.ts`:
- `loadProject(path: string): GBSProject`
- `saveProject(path: string, project: GBSProject): void`
- `validateProject(project: GBSProject): ValidationResult`

#### 1.3 Tools de solo lectura

| Tool | Descripción |
|------|-------------|
| `get_project_info` | Nombre, versión GBS, settings generales |
| `list_scenes` | Listar escenas con nombre, dimensiones, nº de actores |
| `get_scene` | Detalle completo de una escena por nombre o ID |
| `list_actors` | Actores de una escena con posición y propiedades |
| `list_variables` | Variables globales del proyecto |
| `list_assets` | Backgrounds, sprites, música disponibles |
| `get_script` | Leer el script de un actor/escena/trigger |

#### 1.4 Resources MCP

Exponer el proyecto como recursos legibles:

```
gbstudio://project/info
gbstudio://scenes/{sceneId}
gbstudio://actors/{sceneId}/{actorId}
gbstudio://variables
```

---

### Fase 2 — Escritura y modificación (Semana 3-4)

**Meta:** Tools de escritura para modificar el proyecto desde Claude.

#### 2.1 Modificación de escenas y actores

| Tool | Descripción |
|------|-------------|
| `create_scene` | Nueva escena con background y dimensiones |
| `update_scene` | Cambiar nombre, background, tipo de escena |
| `delete_scene` | Eliminar escena del proyecto |
| `create_actor` | Añadir actor a una escena |
| `update_actor` | Mover actor, cambiar sprite, nombre |
| `delete_actor` | Eliminar actor de escena |
| `create_trigger` | Añadir trigger rectangular a escena |

#### 2.2 Modificación de scripts

Los eventos en `.gbsproj` tienen esta estructura JSON:

```json
{
  "id": "evt_uuid",
  "command": "EVENT_TEXT",
  "args": {
    "text": ["¡Hola, aventurero!"]
  }
}
```

| Tool | Descripción |
|------|-------------|
| `add_script_event` | Añadir evento a un script (actor, escena, trigger) |
| `remove_script_event` | Eliminar evento por ID |
| `update_script_event` | Modificar args de un evento existente |
| `set_dialogue` | Shortcut: establecer texto de diálogo en actor |
| `add_scene_transition` | Añadir transición de escena |
| `set_variable` | Añadir evento que setea una variable |

#### 2.3 Gestión de variables

| Tool | Descripción |
|------|-------------|
| `create_variable` | Crear nueva variable global con nombre/símbolo |
| `rename_variable` | Cambiar nombre de variable |
| `list_variable_usages` | Encontrar dónde se usa una variable |

---

### Fase 3 — Compilación y build (Semana 5)

**Meta:** Disparar builds desde Claude usando `gb-studio-cli`.

#### 3.1 Tool de compilación

```typescript
// Tool: build_rom
{
  projectPath: z.string(),
  outputDir: z.string().optional(),
  target: z.enum(["rom", "web"]).default("rom")
}
```

Internamente usa `gb-studio-cli`:
```bash
gb-studio-cli make:rom path/to/project.gbsproj out/
gb-studio-cli make:web path/to/project.gbsproj out/
```

#### 3.2 Tool de validación pre-build

`validate_project` — Verificar antes de compilar:
- Backgrounds con dimensiones válidas (múltiplos de 8)
- Actores dentro de los límites de escena
- Variables referenciadas que existen
- Sprites con frames correctos

---

### Fase 4 — Features avanzados (Semana 6-7)

**Meta:** Herramientas inteligentes de alto nivel.

#### 4.1 GBVM directo

| Tool | Descripción |
|------|-------------|
| `add_gbvm_script` | Insertar bloque GBVM raw en un actor/escena |
| `validate_gbvm` | Verificar sintaxis de instrucciones GBVM |

Instrucciones GBVM más usadas:
```
VM_SET_CONST VAR_score, 0      ; setear variable
VM_PUSH_CONST 30               ; push valor
VM_INVOKE b_wait_frames, ...   ; esperar frames
VM_LOAD_TILESET ...            ; cargar tileset
VM_FADE_IN 1                   ; fade in
```

#### 4.2 Búsqueda y análisis

| Tool | Descripción |
|------|-------------|
| `search_dialogue` | Buscar texto de diálogo en todo el proyecto |
| `find_scene_connections` | Grafo de conexiones entre escenas |
| `analyze_project` | Resumen: nº escenas, actores, variables, tamaño estimado ROM |
| `find_unused_assets` | Assets no referenciados en el proyecto |

#### 4.3 Prompts reutilizables

Registrar prompts MCP para tareas frecuentes:

```
prompt: "design_rpg_scene"   → Template para crear escena RPG estándar
prompt: "add_npc_dialogue"   → Agregar NPC con diálogo y múltiple choice
prompt: "setup_scene_transition" → Conectar dos escenas con fade
```

---

## Configuración en Claude Desktop / Claude.ai

Agregar al `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gb-studio": {
      "command": "node",
      "args": ["/ruta/absoluta/gb-studio-mcp/build/index.js"],
      "env": {
        "GBS_PROJECT_PATH": "/ruta/a/mi-juego/mi-juego.gbsproj"
      }
    }
  }
}
```

O bien, aceptar el `projectPath` como argumento en cada tool call para soportar múltiples proyectos.

---

## Consideraciones Técnicas

### Concurrencia y seguridad

- **Backup automático:** Antes de cualquier escritura, copiar `.gbsproj` → `.gbsproj.bak`
- **Operaciones atómicas:** Escribir a un archivo temporal y renombrar (evitar corrupción)
- **No escribir mientras GB Studio está abierto:** Detectar archivo de lock si existe, o documentar limitación
- **IDs únicos:** Usar `crypto.randomUUID()` para nuevos actores/escenas/eventos

### Manejo del formato JSON

GB Studio usa un formato específico con saltos de línea por propiedad (optimizado para git diff). Usar `JSON.stringify(project, null, 2)` es suficiente y compatible.

### Versiones de GB Studio

El `.gbsproj` incluye `_version`. Implementar validación:
- Soporte inicial: **GB Studio 4.x**
- Detectar versiones incompatibles y notificar al usuario

### Logging en servidor stdio

```typescript
// ❌ Nunca usar console.log() en modo stdio (corrompe JSON-RPC)
console.log("debug");

// ✅ Usar stderr para logs
console.error("[gb-studio-mcp] Proyecto cargado");
```

---

## Stack Tecnológico

| Componente | Tecnología |
|-----------|-----------|
| Lenguaje | TypeScript 5.x |
| Runtime | Node.js 21+ |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Validación de schemas | `zod` |
| Testing | `vitest` |
| Build | `tsc` |
| CLI de GBS | `gb-studio-cli` (opcional, para builds) |

---

## Prioridad de Implementación (MVP)

Para un MVP útil desde el primer día, implementar en este orden:

1. `get_project_info` + `list_scenes` — Entender qué hay en el proyecto
2. `get_scene` + `list_actors` — Inspeccionar contenido
3. `get_script` — Leer lógica existente
4. `set_dialogue` — La modificación más común
5. `create_actor` + `update_actor` — Poblar escenas
6. `build_rom` — Ver el resultado compilado
7. `add_script_event` — Control total de lógica

---

## Referencias

- [GB Studio Docs](https://www.gbstudio.dev/docs/)
- [GB Studio GitHub](https://github.com/chrismaltby/gb-studio)
- [GBVM Instruction Set](https://github.com/chrismaltby/gbvm/blob/master/include/vm.i)
- [GB Studio Plugins](https://www.gbstudio.dev/docs/extending-gbstudio/plugins/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [GB Studio Engine Reference (4.2)](https://www.morphoice.com/gameboy/)
