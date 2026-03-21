import { C4Element, C4Model } from "./types";
import { getViewState, getElementName, hasChildren } from "./navigation";
import {
  createScene,
  renderView,
  startRenderLoop,
  show3D,
  hide3D,
  applyTheme,
  SceneContext,
} from "./scene";
import {
  create2DScene,
  render2DView,
  refresh2D,
  show2D,
  hide2D,
  is2DReady,
} from "./scene2d";
import { testModel } from "./testdata";
import { parseStructurizrJSON } from "./structurizr-parser";
import { parseStructurizrDSL } from "./dsl-parser";
import { settings, onSettingsChange } from "./settings";
import { createControlsPanel } from "./controls-panel";
import { exportPNG, exportSVG } from "./export";

let currentPath: string[] = [];
let sceneCtx: SceneContext;
let model: C4Model = testModel;
let hasLoadedFile = false;

function loadModel(newModel: C4Model): void {
  model = newModel;
  hasLoadedFile = true;

  // Hide welcome screen if visible
  const welcome = document.getElementById("welcome-screen");
  if (welcome) welcome.remove();

  // Show the appropriate view
  if (settings.viewMode === "3d") {
    show3D(sceneCtx);
    hide2D();
  } else {
    hide3D(sceneCtx);
    show2D();
  }

  // Show controls panel & breadcrumb
  const panel = document.getElementById("controls-panel");
  if (panel) panel.style.display = "";
  const toggle = document.getElementById("controls-toggle");
  if (toggle) toggle.style.display = "";
  const breadcrumb = document.getElementById("breadcrumb");
  if (breadcrumb) breadcrumb.style.display = "";

  navigateTo([]);
}

function navigateTo(path: string[]): void {
  currentPath = path;
  const viewState = getViewState(model, currentPath);
  renderView(sceneCtx, viewState);
  if (is2DReady()) render2DView(viewState);
  updateBreadcrumb();
}

function handleElementClick(element: C4Element): void {
  if (hasChildren(model, element.id)) {
    navigateTo([...currentPath, element.id]);
  }
}

function handleElementHover(
  element: C4Element | null,
  event: MouseEvent
): void {
  const tooltip = document.getElementById("tooltip")!;
  if (!element) {
    tooltip.style.display = "none";
    return;
  }

  const nameEl = tooltip.querySelector(".tooltip-name")!;
  const typeEl = tooltip.querySelector(".tooltip-type")!;
  const descEl = tooltip.querySelector(".tooltip-desc")!;
  const hintEl = tooltip.querySelector(".tooltip-hint")!;

  nameEl.textContent = element.name;
  typeEl.textContent = element.technology
    ? `${element.type} · ${element.technology}`
    : element.type;
  descEl.textContent = element.description ?? "";
  hintEl.textContent = hasChildren(model, element.id)
    ? "Click to drill down"
    : "";

  tooltip.style.display = "block";
  tooltip.style.left = event.clientX + 16 + "px";
  tooltip.style.top = event.clientY + 16 + "px";

  const rect = tooltip.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    tooltip.style.left = event.clientX - rect.width - 16 + "px";
  }
  if (rect.bottom > window.innerHeight) {
    tooltip.style.top = event.clientY - rect.height - 16 + "px";
  }
}

function updateBreadcrumb(): void {
  const breadcrumb = document.getElementById("breadcrumb")!;
  breadcrumb.innerHTML = "";

  const rootBtn = document.createElement("button");
  rootBtn.textContent = model.name;
  rootBtn.addEventListener("click", () => navigateTo([]));
  if (currentPath.length === 0) rootBtn.classList.add("active");
  breadcrumb.appendChild(rootBtn);

  for (let i = 0; i < currentPath.length; i++) {
    const separator = document.createElement("span");
    separator.className = "separator";
    separator.textContent = "›";
    breadcrumb.appendChild(separator);

    const btn = document.createElement("button");
    btn.textContent =
      getElementName(model, currentPath[i]) ?? currentPath[i];
    const pathToHere = currentPath.slice(0, i + 1);
    btn.addEventListener("click", () => navigateTo(pathToHere));
    if (i === currentPath.length - 1) btn.classList.add("active");
    breadcrumb.appendChild(btn);
  }
}

let previousTheme = settings.theme;

function handleSettingsChange(): void {
  const app = document.getElementById("app")!;
  app.dataset.view = settings.viewMode;
  app.dataset.theme = settings.theme;

  // Theme changed → re-render everything with new colors
  if (settings.theme !== previousTheme) {
    previousTheme = settings.theme;
    applyTheme(sceneCtx);
    // Re-render elements with new palette
    const viewState = getViewState(model, currentPath);
    renderView(sceneCtx, viewState);
    if (is2DReady()) render2DView(viewState);
    return;
  }

  // View mode switch
  if (settings.viewMode === "3d") {
    show3D(sceneCtx);
    hide2D();
  } else {
    hide3D(sceneCtx);
    show2D();
    const viewState = getViewState(model, currentPath);
    render2DView(viewState);
  }

  // Refresh 2D if visible (for label toggle etc.)
  if (settings.viewMode === "2d" && is2DReady()) {
    refresh2D();
  }
}

// ── File loading ──

function handleFile(file: File): void {
  const isDsl = file.name.endsWith(".dsl");
  const isJson = file.name.endsWith(".json");
  if (!isDsl && !isJson) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = reader.result as string;
      const parsed = isDsl ? parseStructurizrDSL(text) : parseStructurizrJSON(text);
      loadModel(parsed);
    } catch (err) {
      console.error("Failed to parse workspace:", err);
    }
  };
  reader.readAsText(file);
}

function setupFileHandling(): void {
  const fileInput = document.getElementById("file-input") as HTMLInputElement;
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
    fileInput.value = "";
  });

  const overlay = document.getElementById("drag-overlay")!;
  let dragCounter = 0;

  document.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    overlay.classList.add("active");
  });
  document.addEventListener("dragleave", (e) => {
    e.preventDefault();
    if (--dragCounter <= 0) {
      dragCounter = 0;
      overlay.classList.remove("active");
    }
  });
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.remove("active");
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  });
}

function init(): void {
  const container = document.getElementById("app")!;

  // Apply system theme preference at startup
  container.dataset.theme = settings.theme;

  sceneCtx = createScene(container, handleElementClick, handleElementHover);
  startRenderLoop(sceneCtx);

  create2DScene(container, handleElementClick, handleElementHover);
  hide2D();

  createControlsPanel((format) => {
    if (format === "png") {
      exportPNG();
    } else if (format === "svg") {
      exportSVG(model);
    }
  });
  onSettingsChange(handleSettingsChange);
  setupFileHandling();

  // Check if served by CLI — if so, auto-load
  autoLoadFromCLI().then((loaded) => {
    if (!loaded) {
      // Standalone mode: show welcome screen
      hide3D(sceneCtx);
      hide2D();
      showWelcomeScreen();
    }
  });

  // Expose for testing
  (window as any).__navigateTo = navigateTo;
}

function showWelcomeScreen(): void {
  // Hide controls panel and breadcrumb until a file is loaded
  const panel = document.getElementById("controls-panel");
  if (panel) panel.style.display = "none";
  const toggle = document.getElementById("controls-toggle");
  if (toggle) toggle.style.display = "none";
  const breadcrumb = document.getElementById("breadcrumb");
  if (breadcrumb) breadcrumb.style.display = "none";

  const welcome = document.createElement("div");
  welcome.id = "welcome-screen";
  welcome.innerHTML = `
    <div class="welcome-content">
      <div class="welcome-logo">◆ Spacerizr</div>
      <div class="welcome-tagline">Interactive C4 Architecture Visualizer</div>
      <div class="welcome-dropzone" id="welcome-dropzone">
        <div class="welcome-drop-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div class="welcome-drop-text">Drop a <strong>.dsl</strong> or <strong>.json</strong> workspace file here</div>
        <div class="welcome-drop-or">or</div>
        <label class="welcome-browse-btn" for="file-input">Browse files</label>
      </div>
      <div class="welcome-formats">
        Supports Structurizr DSL and workspace JSON files
      </div>
    </div>
  `;
  document.getElementById("app")!.appendChild(welcome);
}

interface WorkspaceFile {
  name: string;
  path: string;
  type: string;
  relativePath: string;
}

async function autoLoadFromCLI(): Promise<boolean> {
  try {
    const res = await fetch("/api/files");
    if (!res.ok) return false;
    const files: WorkspaceFile[] = await res.json();
    if (files.length === 0) return false;

    if (files.length === 1) {
      await loadWorkspaceFromCLI(files[0].path);
    } else {
      showFileBrowser(files);
    }

    // Connect to watch mode SSE if available
    connectWatchMode();

    return true;
  } catch {
    return false;
  }
}

function connectWatchMode(): void {
  try {
    const es = new EventSource("/api/watch");
    es.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "reload" && data.file) {
        console.log(`♻️ File changed: ${data.file}`);
        await loadWorkspaceFromCLI(data.file);
      }
    };
    es.onerror = () => {
      // Watch mode not available or disconnected — close silently
      es.close();
    };
  } catch {
    // SSE not supported
  }
}

async function loadWorkspaceFromCLI(filePath: string): Promise<void> {
  const res = await fetch(`/api/workspace?file=${encodeURIComponent(filePath)}`);
  const data = await res.json();
  if (!data.content) return;

  const parsed =
    data.type === "dsl"
      ? parseStructurizrDSL(data.content)
      : parseStructurizrJSON(data.content);
  loadModel(parsed);
  console.log(`Loaded workspace: ${data.name}`);
}

function showFileBrowser(files: WorkspaceFile[]): void {
  // Hide 3D/2D views and show landing page
  hide3D(sceneCtx);
  hide2D();

  const landing = document.createElement("div");
  landing.id = "file-browser";

  // Group files by directory
  const groups = new Map<string, WorkspaceFile[]>();
  for (const f of files) {
    const parts = f.relativePath.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir)!.push(f);
  }

  let html = `
    <div class="fb-header">
      <div class="fb-logo">◆ Spacerizr</div>
      <div class="fb-subtitle">Architecture Workspaces</div>
    </div>
    <div class="fb-grid">
  `;

  for (const [dir, dirFiles] of groups) {
    if (groups.size > 1 && dir !== ".") {
      html += `<div class="fb-dir-label">${dir}/</div>`;
    }
    for (const f of dirFiles) {
      const icon = f.type === "dsl" ? "{ }" : "{ }";
      const ext = f.type === "dsl" ? ".dsl" : ".json";
      const nameWithoutExt = f.name.replace(/\.(dsl|json)$/, "");
      html += `
        <button class="fb-card" data-path="${f.path}">
          <div class="fb-card-icon">${icon}</div>
          <div class="fb-card-name">${nameWithoutExt}</div>
          <div class="fb-card-ext">${ext}</div>
        </button>
      `;
    }
  }

  html += `</div>`;
  landing.innerHTML = html;
  document.getElementById("app")!.appendChild(landing);

  // Click handlers
  landing.querySelectorAll(".fb-card").forEach((card) => {
    card.addEventListener("click", async () => {
      const filePath = (card as HTMLElement).dataset.path!;
      landing.remove();

      // Show viewer
      if (settings.viewMode === "3d") show3D(sceneCtx);
      else show2D();

      await loadWorkspaceFromCLI(filePath);

      // Add back-button and file switcher to breadcrumb
      addFileSwitcher(files, filePath);
    });
  });
}

let activeFiles: WorkspaceFile[] | null = null;

function addFileSwitcher(files: WorkspaceFile[], currentFilePath: string): void {
  activeFiles = files;

  // Remove existing top-bar if any
  document.getElementById("top-bar")?.remove();

  const topBar = document.createElement("div");
  topBar.id = "top-bar";

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.id = "fb-close-btn";
  closeBtn.title = "Back to file list";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    topBar.remove();
    showFileBrowser(files);
  });
  topBar.appendChild(closeBtn);

  // Separator
  const sep1 = document.createElement("div");
  sep1.className = "fb-separator";
  topBar.appendChild(sep1);

  // File dropdown
  const select = document.createElement("select");
  select.id = "fb-file-select";
  for (const f of files) {
    const opt = document.createElement("option");
    opt.value = f.path;
    opt.textContent = f.name;
    if (f.path === currentFilePath) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", async () => {
    await loadWorkspaceFromCLI(select.value);
    currentPath = [];
    navigateTo([]);
  });
  topBar.appendChild(select);

  // Separator
  const sep2 = document.createElement("div");
  sep2.className = "fb-separator";
  topBar.appendChild(sep2);

  // Move the existing breadcrumb into the top-bar
  const breadcrumb = document.getElementById("breadcrumb");
  if (breadcrumb) {
    topBar.appendChild(breadcrumb);
  }

  document.getElementById("app")!.appendChild(topBar);
}

init();
