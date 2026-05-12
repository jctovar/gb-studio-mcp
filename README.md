# 🎮 GB Studio MCP

> Servidor MCP para leer, analizar y modificar proyectos **GB Studio** directamente desde Claude — sin abrir la interfaz gráfica.

[![MCP](https://img.shields.io/badge/protocol-MCP-blueviolet)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)](https://www.typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-21%2B-green)](https://nodejs.org)
[![GB Studio](https://img.shields.io/badge/GB%20Studio-4.x-red)](https://www.gbstudio.dev)

---

## ¿Qué es esto?

`gb-studio-mcp` expone las capacidades de edición de proyectos GB Studio como herramientas MCP. Claude puede leer escenas, crear actores, escribir scripts, compilar ROMs y analizar todo el proyecto — sin que tú tengas que copiar y pegar JSON ni tocar el archivo `.gbsproj` a mano.

```
Claude ──── MCP (stdio) ──── gb-studio-mcp ──── proyecto.gbsproj
```

---

## Características

| Categoría | Herramientas |
|-----------|-------------|
| **Proyecto** | `get_project_info`, `validate_project` |
| **Escenas** | `list_scenes`, `get_scene`, `list_actors` |
| **Variables** | `list_variables`, `create_variable`, `rename_variable`, `list_variable_usages` |
| **Assets** | `list_assets` |
| **Scripts** | `get_script`, `add_script_event`, `remove_script_event`, `update_script_event`, `set_dialogue`, `add_scene_transition`, `set_variable` |
| **Escritura** | `create_scene`, `update_scene`, `delete_scene`, `create_actor`, `update_actor`, `delete_actor`, `create_trigger`, `update_trigger` |
| **Compilación** | `build_project`, `check_build_tools` |
| **Análisis** | `search_dialogue`, `find_scene_connections`, `analyze_project`, `find_unused_assets` |

**31 tools · 3 prompts · 3 resources**

---

## Instalación

### Requisitos previos

- Node.js 21 o superior
- Un proyecto GB Studio 4.x (archivo `.gbsproj`)

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/gb-studio-mcp.git
cd gb-studio-mcp

# 2. Instalar dependencias
npm install

# 3. Compilar
npm run build
```

---

## Configuración en Claude Desktop

Edita el archivo de configuración de Claude Desktop:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Configuración básica

```json
{
  "mcpServers": {
    "gb-studio": {
      "command": "node",
      "args": ["/ruta/a/gb-studio-mcp/build/index.js"]
    }
  }
}
```

### Con MCP Resources activados

Si quieres usar los recursos MCP (`gbstudio://project/info`, etc.), añade la variable de entorno con la ruta a tu proyecto:

```json
{
  "mcpServers": {
    "gb-studio": {
      "command": "node",
      "args": ["/ruta/a/gb-studio-mcp/build/index.js"],
      "env": {
        "GBS_PROJECT_PATH": "/ruta/a/tu-proyecto/proyecto.gbsproj"
      }
    }
  }
}
```

> Reinicia Claude Desktop después de editar la configuración.

---

## Uso

La mayoría de herramientas reciben `projectPath` como primer argumento. Puedes darle esa ruta a Claude directamente:

### Ejemplos de conversación

**Explorar el proyecto:**
```
Analiza el proyecto en /Proyectos/mi-juego/mi-juego.gbsproj
```

**Crear contenido:**
```
Crea una escena RPG llamada "Pueblo" en mi proyecto. 
Usa list_assets primero para elegir un background.
```

**Depurar:**
```
Busca todos los diálogos que contengan "espada" en el proyecto.
¿Hay escenas desconectadas (sin transiciones)?
```

**Compilar:**
```
Valida el proyecto y compila la ROM si no hay errores críticos.
```

---

## Herramientas de referencia

### Lectura

| Tool | Descripción |
|------|-------------|
| `get_project_info` | Nombre, versión, autor y conteos generales |
| `validate_project` | Pre-validación: bounds, dimensiones, referencias |
| `list_scenes` | Lista de escenas con ID, tipo y dimensiones |
| `get_scene` | Detalle de escena por nombre o ID |
| `list_actors` | Actores de una escena con posición y sprite |
| `list_variables` | Variables globales (filtrable por nombre/símbolo) |
| `list_assets` | Assets por tipo: `backgrounds`, `sprites`, `music`, `sounds`, `fonts` |
| `get_script` | Script de escena, actor o trigger (por slot) |

### Escritura de escenas

| Tool | Descripción |
|------|-------------|
| `create_scene` | Nueva escena (tipo: `topDown`, `platform`, `adventure`, `shmup`, `pointAndClick`, `logo`) |
| `update_scene` | Modifica nombre, tipo, dimensiones o background |
| `delete_scene` | Elimina una escena (advierte si es la escena inicial) |
| `create_actor` | Nuevo actor con posición, movimiento y sprite |
| `update_actor` | Actualiza propiedades de un actor |
| `delete_actor` | Elimina un actor de una escena |
| `create_trigger` | Nuevo trigger con posición y dimensiones |
| `update_trigger` | Actualiza propiedades de un trigger |

### Escritura de scripts

| Tool | Descripción |
|------|-------------|
| `add_script_event` | Inserta cualquier evento en un script (comando + args) |
| `remove_script_event` | Elimina un evento por ID (busca en todo el proyecto) |
| `update_script_event` | Actualiza los args de un evento existente |
| `set_dialogue` | Atajo: crea/reemplaza `EVENT_TEXT` en escena, actor o trigger |
| `add_scene_transition` | Atajo: crea `EVENT_SWITCH_SCENE` con destino y posición |
| `set_variable` | Atajo: crea `EVENT_SET_VALUE` para una variable global |

### Variables

| Tool | Descripción |
|------|-------------|
| `create_variable` | Nueva variable global con nombre y símbolo auto-generado |
| `rename_variable` | Renombra variable por ID o nombre actual |
| `list_variable_usages` | Dónde se usa una variable en los scripts del proyecto |

### Compilación

| Tool | Descripción |
|------|-------------|
| `build_project` | Compila a ROM (`.gb`) o web via `gb-studio-cli`. Valida antes por defecto |
| `check_build_tools` | Detecta si `gb-studio-cli` está instalado y muestra su versión |

Para compilar necesitas `gb-studio-cli`:

```bash
npm install -g @gbstudio/gb-studio-cli
```

### Análisis

| Tool | Descripción |
|------|-------------|
| `search_dialogue` | Busca texto en todos los `EVENT_TEXT` del proyecto |
| `find_scene_connections` | Grafo de navegación entre escenas via `EVENT_SWITCH_SCENE` |
| `analyze_project` | Estadísticas completas: conteos, comandos más usados, assets, variables |
| `find_unused_assets` | Backgrounds, sprites, música y sonidos no referenciados |

---

## Prompts MCP

Los prompts son guías paso a paso que Claude sigue automáticamente. Aparecen en el menú de prompts de Claude Desktop.

| Prompt | Descripción |
|--------|-------------|
| `design_rpg_scene` | Crea una escena RPG completa con NPCs, diálogos y trigger de salida |
| `add_npc_dialogue` | Añade un NPC con diálogo en una escena existente |
| `setup_scene_transition` | Conecta dos escenas con transiciones bidireccionales |

---

## Resources MCP

Disponibles cuando se configura `GBS_PROJECT_PATH`:

| URI | Descripción |
|-----|-------------|
| `gbstudio://project/info` | Metadatos del proyecto (nombre, versión, conteos) |
| `gbstudio://scenes/{sceneId}` | Detalle de una escena por su ID |
| `gbstudio://variables` | Lista completa de variables globales |

---

## Desarrollo

```bash
# Compilar en modo watch
npx tsc --watch

# Ejecutar desde fuente (sin compilar)
npm run dev

# Ejecutar build compilado
npm start
```

### Estructura del proyecto

```
src/
├── index.ts                    # Entry point (StdioServerTransport)
├── server.ts                   # Registro de todos los módulos
├── lib/
│   ├── gbsproj-parser.ts       # loadProject, saveProject, validateProject
│   └── project-helpers.ts      # Helpers compartidos (resolve*, walk*, etc.)
├── types/
│   └── gbstudio.d.ts           # Interfaces TypeScript del formato .gbsproj
├── tools/
│   ├── project.ts              # Fase 1 — info y validación
│   ├── scenes.ts               # Fase 1 — lectura de escenas
│   ├── variables.ts            # Fase 1 — variables
│   ├── assets.ts               # Fase 1 — assets
│   ├── scripts.ts              # Fase 1 — scripts
│   ├── scenes-write.ts         # Fase 2 — escritura de escenas/actores/triggers
│   ├── scripts-write.ts        # Fase 2 — escritura de scripts
│   ├── variables-write.ts      # Fase 2 — escritura de variables
│   ├── build.ts                # Fase 3 — compilación
│   └── analysis.ts             # Fase 4 — análisis avanzado
├── prompts/
│   └── gbstudio-prompts.ts     # Fase 4 — prompts MCP
└── resources/
    └── project-resource.ts     # Fase 4 — resources MCP
```

### Seguridad de escritura

Cada vez que `saveProject` escribe el proyecto:

1. Crea un backup automático en `proyecto.gbsproj.bak`
2. Escribe en un archivo temporal `proyecto.gbsproj.tmp`
3. Renombra atómicamente al archivo final

Esto garantiza que una interrupción nunca deja el `.gbsproj` en estado corrupto.

---

## Notas de compatibilidad

- GB Studio **4.x** — formato `.gbsproj` JSON
- El servidor es **read-safe**: `loadProject` nunca modifica el archivo
- Las herramientas de escritura validan límites antes de guardar (actores fuera de bounds, dimensiones incorrectas, etc.)
- `build_project` ejecuta `validate_project` automáticamente antes de compilar (desactivable con `validateFirst: false`)

---

## Licencia

ISC — consulta `package.json` para detalles.
