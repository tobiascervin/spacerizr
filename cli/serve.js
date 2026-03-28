#!/usr/bin/env node

import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, watchFile } from "node:fs";
import { join, resolve, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST_DIR = join(__dirname, "..", "dist");

// ── Parse CLI arguments ──

const args = process.argv.slice(2);
let targetPath = null;
let exportFormat = null;
let outputPath = null;
let port = 4777;
let showHelp = false;
let watchMode = false;
let theme = "dark";

let validateMode = false;
let allLevels = false;
let diffMode = false;
let diffFiles = [];

// Check for diff mode: spacerizr diff old.dsl new.dsl
if (args[0] === "diff") {
  diffMode = true;
  diffFiles = args.slice(1).filter(a => !a.startsWith("-"));
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--help" || arg === "-h") {
    showHelp = true;
  } else if (arg === "--export" || arg === "-e") {
    exportFormat = args[++i];
  } else if (arg === "--output" || arg === "-o") {
    outputPath = args[++i];
  } else if (arg === "--port" || arg === "-p") {
    port = parseInt(args[++i], 10);
  } else if (arg === "--watch" || arg === "-w") {
    watchMode = true;
  } else if (arg === "--theme" || arg === "-t") {
    theme = args[++i];
  } else if (arg === "--validate") {
    validateMode = true;
  } else if (arg === "--all-levels") {
    allLevels = true;
  } else if (!arg.startsWith("-")) {
    targetPath = arg;
  }
}

// ── Load config file ──

function loadConfig(dir) {
  const configPath = join(dir, ".spacerizr.json");
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      console.log(`  📋 Using config: .spacerizr.json`);
      return config;
    } catch (e) {
      console.warn(`  ⚠️  Invalid .spacerizr.json: ${e.message}`);
    }
  }
  return {};
}

const configDir = targetPath ? resolve(targetPath) : process.cwd();
const configBase = existsSync(configDir) && statSync(configDir).isDirectory() ? configDir : dirname(configDir);
const config = loadConfig(configBase);

// Merge: config < CLI flags (CLI wins)
if (!targetPath && config.files) targetPath = configBase;
if (port === 4777 && config.port) port = config.port;
if (theme === "dark" && config.theme) theme = config.theme;
if (!watchMode && config.watch) watchMode = config.watch;
if (!exportFormat && config.export?.format) exportFormat = config.export.format;
if (!outputPath && config.export?.output) outputPath = config.export.output;

if (showHelp) {
  console.log(`
  🚀 Spacerizr — Interactive C4 architecture visualizer

  Usage:
    spacerizr [file-or-dir] [options]

  Arguments:
    file-or-dir    Path to a .dsl or .json workspace file, or a directory
                   containing them. Defaults to current directory.

  Commands:
    spacerizr [file-or-dir]              Open the interactive viewer
    spacerizr diff <old> <new>           Compare two architecture files and show
                                         what was added, removed, or changed.
                                         Supports .dsl and .json workspace files.

  Options:
    --port, -p     Port to serve on (default: 4777)
    --export, -e   Export format: svg, mermaid, plantuml, html, pdf
                     svg       — Scalable vector graphic of the current view
                     mermaid   — Mermaid diagram syntax (clipboard-ready)
                     plantuml  — PlantUML diagram syntax (clipboard-ready)
                     html      — Self-contained interactive HTML with pan/zoom
                     pdf       — Multi-page PDF with one page per hierarchy level
    --output, -o   Output file path for export (default: spacerizr.<format>)
    --theme, -t    Theme for export: dark or light (default: dark)
    --watch, -w    Watch for file changes and auto-reload the browser
    --validate     Validate workspace files and report structural errors
    --all-levels   Export all hierarchy levels as separate files (with --export)
    --help, -h     Show this help message

  Viewer keyboard shortcuts:
    Arrow keys     Navigate between elements (drill down / go back)
    Ctrl+K         Open command palette (search elements, toggle features)
    Ctrl+Shift+E   Export current view as SVG
    2 / 3          Switch between 2D and 3D view modes

  Presentation mode:
    Enter "Present" from the control panel or press the Present button.
    Left/Right     Navigate between slides
    N              Open presenter view with speaker notes and timer
    1 / 2          Pointer tools: laser, spotlight
    D              Toggle drawing mode (pen, highlighter, eraser)
    T              Start/stop camera fly-through tour
    ?              Show help overlay with all shortcuts
    Esc            Exit presentation or current tool

  Examples:
    spacerizr                                  # Scan current dir, open viewer
    spacerizr workspace.dsl                    # Open specific file
    spacerizr docs/                            # Scan docs/ for .dsl/.json files
    spacerizr workspace.dsl -e svg             # Export as SVG
    spacerizr workspace.dsl -e pdf             # Export as multi-page PDF
    spacerizr workspace.dsl -e svg -o arch.svg # Export to specific file
    spacerizr workspace.dsl -e svg -t light    # Export with light theme
    spacerizr workspace.dsl --watch            # Watch for changes
    spacerizr docs/ -e svg --all-levels        # Export every hierarchy level
    spacerizr diff v1.dsl v2.dsl               # Show architecture diff
    spacerizr --validate docs/                 # Validate workspace files

  In your project's package.json:
    {
      "scripts": {
        "arch": "spacerizr",
        "arch:view": "spacerizr docs/workspace.dsl",
        "arch:export": "spacerizr docs/ --export svg",
        "arch:diff": "spacerizr diff docs/v1.dsl docs/v2.dsl",
        "arch:watch": "spacerizr docs/ --watch"
      }
    }
`);
  process.exit(0);
}

// ── Resolve workspace files ──

function findWorkspaceFiles(dir) {
  const files = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isFile() && (entry.endsWith(".dsl") || entry.endsWith(".json"))) {
        // Skip package.json, tsconfig.json, etc.
        if (entry === "package.json" || entry === "tsconfig.json" || entry === "package-lock.json") continue;
        files.push(full);
      }
      // Recurse into subdirs (max 2 levels deep)
      if (stat.isDirectory() && !entry.startsWith(".") && entry !== "node_modules" && entry !== "dist") {
        for (const sub of readdirSync(full)) {
          const subFull = join(full, sub);
          if (statSync(subFull).isFile() && (sub.endsWith(".dsl") || sub.endsWith(".json"))) {
            if (sub === "package.json" || sub === "tsconfig.json") continue;
            files.push(subFull);
          }
        }
      }
    }
  } catch (e) {
    // ignore permission errors
  }
  return files;
}

const resolvedPath = targetPath ? resolve(targetPath) : process.cwd();
let workspaceFiles = [];
let initialFile = null;

if (existsSync(resolvedPath)) {
  const stat = statSync(resolvedPath);
  if (stat.isFile()) {
    workspaceFiles = [resolvedPath];
    initialFile = resolvedPath;
  } else if (stat.isDirectory()) {
    workspaceFiles = findWorkspaceFiles(resolvedPath);
    if (workspaceFiles.length === 1) {
      initialFile = workspaceFiles[0];
    }
  }
} else {
  console.error(`❌ Path not found: ${resolvedPath}`);
  process.exit(1);
}

if (workspaceFiles.length === 0) {
  console.error("❌ No .dsl or .json workspace files found.");
  console.error("   Run 'spacerizr --help' for usage information.");
  process.exit(1);
}

console.log(`\n  🚀 Spacerizr\n`);
console.log(`  Found ${workspaceFiles.length} workspace file(s):`);
for (const f of workspaceFiles) {
  const marker = f === initialFile ? " ← loading" : "";
  console.log(`    • ${basename(f)}${marker}`);
}

// ── Headless SVG export ──

if (exportFormat === "svg" || exportFormat === "mermaid" || exportFormat === "plantuml" || exportFormat === "html") {
  // Dynamic import of the bundled API (contains parsers + SVG renderer)
  const apiPath = join(__dirname, "..", "dist-lib", "api.js");
  if (!existsSync(apiPath)) {
    console.error("\n  ❌ Library build not found. Run 'npm run build:lib' first.");
    console.error("     Or add to package.json scripts: \"build:lib\": \"vite build --mode lib\"\n");
    process.exit(1);
  }

  const api = await import(apiPath);
  const { parseDSL, parseJSON, renderSVG, renderMermaid, renderPlantUML } = api;

  const extMap = { svg: ".svg", mermaid: ".md", plantuml: ".puml", html: ".html" };
  const ext = extMap[exportFormat] || ".svg";

  for (const filePath of workspaceFiles) {
    const content = readFileSync(filePath, "utf-8");
    const isDsl = filePath.endsWith(".dsl");
    const model = isDsl ? parseDSL(content) : parseJSON(content);

    let output;
    if (exportFormat === "mermaid") {
      output = renderMermaid(model);
    } else if (exportFormat === "plantuml") {
      output = renderPlantUML(model);
    } else if (exportFormat === "html") {
      const svg = renderSVG(model, { theme });
      const bg = theme === "dark" ? "#0f0f1a" : "#fafafa";
      output = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${model.name}</title><style>*{margin:0;padding:0}body{background:${bg};display:flex;justify-content:center;padding:40px}</style></head><body>${svg}</body></html>`;
    } else {
      output = renderSVG(model, { theme });
    }

    const outFile = outputPath
      ? (workspaceFiles.length === 1 ? outputPath : join(dirname(outputPath), basename(filePath).replace(/\.(dsl|json)$/, ext)))
      : basename(filePath).replace(/\.(dsl|json)$/, ext);

    writeFileSync(outFile, output);
    console.log(`  ✅ Exported: ${outFile}`);
  }

  console.log(`\n  Done! ${workspaceFiles.length} file(s) exported.\n`);
  process.exit(0);
}

// ── Validate mode ──

if (validateMode) {
  const apiPath = join(__dirname, "..", "dist-lib", "api.js");
  if (!existsSync(apiPath)) {
    console.error("\n  ❌ Library build not found. Run 'npm run build:lib' first.\n");
    process.exit(1);
  }

  const { parseDSL, parseJSON, validateModel } = await import(apiPath);
  let hasErrors = false;

  for (const filePath of workspaceFiles) {
    const content = readFileSync(filePath, "utf-8");
    const isDsl = filePath.endsWith(".dsl");
    try {
      const model = isDsl ? parseDSL(content) : parseJSON(content);
      const diagnostics = validateModel(model);
      const errors = diagnostics.filter(d => d.level === "error");
      const warnings = diagnostics.filter(d => d.level === "warning");

      if (diagnostics.length === 0) {
        console.log(`  ✅ ${basename(filePath)} — valid`);
      } else {
        if (errors.length > 0) hasErrors = true;
        console.log(`\n  📄 ${basename(filePath)}`);
        for (const d of diagnostics) {
          const icon = d.level === "error" ? "❌" : "⚠️";
          console.log(`    ${icon} ${d.message}`);
        }
      }
    } catch (e) {
      hasErrors = true;
      console.log(`\n  📄 ${basename(filePath)}`);
      console.log(`    ❌ Parse error: ${e.message}`);
    }
  }

  console.log();
  process.exit(hasErrors ? 1 : 0);
}

// ── Diff mode ──

if (diffMode) {
  if (diffFiles.length < 2) {
    console.error("\n  ❌ Diff requires two files: spacerizr diff old.dsl new.dsl\n");
    process.exit(1);
  }

  const apiPath = join(__dirname, "..", "dist-lib", "api.js");
  if (!existsSync(apiPath)) {
    console.error("\n  ❌ Library build not found. Run 'npm run build:lib' first.\n");
    process.exit(1);
  }

  const { parseDSL, parseJSON, diffModels, formatDiff } = await import(apiPath);

  const [oldFile, newFile] = diffFiles.map(f => resolve(f));
  for (const f of [oldFile, newFile]) {
    if (!existsSync(f)) {
      console.error(`  ❌ File not found: ${f}`);
      process.exit(1);
    }
  }

  function parseFile(filePath) {
    const content = readFileSync(filePath, "utf-8");
    return filePath.endsWith(".dsl") ? parseDSL(content) : parseJSON(content);
  }

  const oldModel = parseFile(oldFile);
  const newModel = parseFile(newFile);
  const diff = diffModels(oldModel, newModel);

  console.log(`\n  📊 Diff: ${basename(oldFile)} → ${basename(newFile)}\n`);
  console.log(formatDiff(diff));
  console.log();
  process.exit(0);
}

// ── MIME types ──

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};

// ── HTTP Server ──

// ── Watch mode: track file changes ──

const sseClients = new Set();

if (watchMode) {
  console.log(`\n  👀 Watch mode enabled — auto-reloading on file changes`);

  for (const filePath of workspaceFiles) {
    watchFile(filePath, { interval: 500 }, () => {
      console.log(`  🔄 Changed: ${basename(filePath)}`);
      // Notify all connected SSE clients
      for (const client of sseClients) {
        client.write(`data: ${JSON.stringify({ type: "reload", file: filePath })}\n\n`);
      }
    });
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const pathname = url.pathname;

  // SSE: live-reload endpoint for watch mode
  if (pathname === "/api/watch") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": `http://localhost:${port}`,
    });
    res.write("data: {\"type\":\"connected\"}\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  // API: list workspace files
  if (pathname === "/api/files") {
    const baseDir = statSync(resolvedPath).isDirectory() ? resolvedPath : resolve(".");
    const fileList = workspaceFiles.map((f) => ({
      name: basename(f),
      path: f,
      type: f.endsWith(".dsl") ? "dsl" : "json",
      relativePath: f.startsWith(baseDir) ? f.slice(baseDir.length + 1) : basename(f),
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(fileList));
    return;
  }

  // API: get workspace content
  if (pathname === "/api/workspace") {
    const filePath = url.searchParams.get("file") || initialFile;
    if (!filePath || !existsSync(filePath)) {
      res.writeHead(404);
      res.end("File not found");
      return;
    }
    // Path traversal protection: only allow files within the workspace directory
    const baseDir = statSync(resolvedPath).isDirectory() ? resolvedPath : dirname(resolvedPath);
    const resolvedFile = resolve(filePath);
    if (!resolvedFile.startsWith(baseDir + "/") && resolvedFile !== baseDir) {
      res.writeHead(403);
      res.end("Access denied");
      return;
    }
    const content = readFileSync(resolvedFile, "utf-8");
    const type = resolvedFile.endsWith(".dsl") ? "dsl" : "json";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ content, type, name: basename(resolvedFile) }));
    return;
  }

  // Serve static files from dist/
  let filePath = join(DIST_DIR, pathname === "/" ? "index.html" : pathname);

  // Path traversal protection: ensure resolved path stays within DIST_DIR
  const resolvedStatic = resolve(filePath);
  if (!resolvedStatic.startsWith(DIST_DIR + "/") && resolvedStatic !== DIST_DIR) {
    filePath = join(DIST_DIR, "index.html"); // SPA fallback
  }

  if (!existsSync(filePath)) {
    // SPA fallback
    filePath = join(DIST_DIR, "index.html");
  }

  const securityHeaders = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:",
  };

  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    const mime = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime, ...securityHeaders });
    res.end(content);
  } catch {
    res.writeHead(404, securityHeaders);
    res.end("Not found");
  }
});

server.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`\n  🌐 Viewer: ${url}\n`);

  // Try to open browser
  try {
    const cmd =
      process.platform === "darwin" ? "open" :
      process.platform === "win32" ? "start" : "xdg-open";
    execFileSync(cmd, [url], { stdio: "ignore" });
  } catch {
    // Couldn't open browser, user can open manually
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n  👋 Shutting down...\n");
  server.close();
  process.exit(0);
});
