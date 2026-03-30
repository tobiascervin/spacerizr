import { C4Element, C4Model } from "./types";
import { examples } from "./examples";

function isTouchDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
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
import { settings, onSettingsChange, notifySettingsChange } from "./settings";
import { createControlsPanel, updateLegendColors } from "./controls-panel";
import { exportPNG, exportSVG, copyPNG, copySVG, exportAllLevelsZIP, copyMermaid, copyPlantUML, exportHTML } from "./export";
import { exportPDF } from "./pdf-export";
import { initPresentation, enterPresentation, exitPresentation, isPresentationActive, openSlideEditor, toggleElementSpotlight, clearAllSpotlights } from "./presentation";
import { setSpotlight, clearSpotlight } from "./scene2d";
import { setSpotlight3D, clearSpotlight3D } from "./scene";

let currentPath: string[] = [];
let sceneCtx: SceneContext;
let model: C4Model = testModel;
let hasLoadedFile = false;

// ── Recent files ──

interface RecentFile {
  name: string;
  content: string;
  type: "dsl" | "json";
  timestamp: number;
}

function saveRecent(name: string, content: string, type: "dsl" | "json"): void {
  try {
    const raw = localStorage.getItem("spacerizr-recent");
    let recent: RecentFile[] = raw ? JSON.parse(raw) : [];
    // Remove duplicate
    recent = recent.filter((r) => r.name !== name);
    // Add to front
    recent.unshift({ name, content, type, timestamp: Date.now() });
    // Max 5
    if (recent.length > 5) recent = recent.slice(0, 5);
    localStorage.setItem("spacerizr-recent", JSON.stringify(recent));
  } catch { /* quota */ }
}

function getRecent(): RecentFile[] {
  try {
    const raw = localStorage.getItem("spacerizr-recent");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

let lastLoadedContent = "";
let lastLoadedName = "";
let lastLoadedType: "dsl" | "json" = "dsl";

function loadModel(newModel: C4Model): void {
  model = newModel;
  hasLoadedFile = true;

  // Save to recent files
  if (lastLoadedName) {
    saveRecent(lastLoadedName, lastLoadedContent, lastLoadedType);
  }

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

  // Show controls panel, breadcrumb, dropzone, feedback
  const panel = document.getElementById("controls-panel");
  if (panel) panel.style.display = "";
  const toggle = document.getElementById("controls-toggle");
  if (toggle) toggle.style.display = "";
  const breadcrumb = document.getElementById("breadcrumb");
  if (breadcrumb) breadcrumb.style.display = "";
  const dropzone = document.getElementById("dropzone");
  if (dropzone) dropzone.style.display = "";
  const feedbackBtn = document.getElementById("feedback-btn");
  if (feedbackBtn) feedbackBtn.style.display = "";

  // Set body background for theme
  document.body.style.background = settings.theme === "dark" ? "#0f0f1a" : "#fafafa";

  navigateTo([]);
}

function navigateTo(path: string[]): void {
  currentPath = path;
  const viewState = getViewState(model, currentPath);
  renderView(sceneCtx, viewState);
  if (is2DReady()) render2DView(viewState);
  updateBreadcrumb();
  updateUrlHash();
}

function handleElementClick(element: C4Element, event?: MouseEvent): void {
  if (isPresentationActive()) {
    // In presentation mode: toggle spotlight instead of drilling down
    toggleElementSpotlight(element.id, event?.shiftKey ?? false);
    return;
  }
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

function goHome(): void {
  if (!hasLoadedFile) return;
  if (!confirm("Leave current workspace and return to the welcome screen?")) return;
  hasLoadedFile = false;
  hide3D(sceneCtx);
  hide2D();
  currentPath = [];

  // Remove top-bar if present (CLI mode)
  document.getElementById("top-bar")?.remove();

  showWelcomeScreen();
}

function updateBreadcrumb(): void {
  const breadcrumb = document.getElementById("breadcrumb")!;
  breadcrumb.innerHTML = "";

  // Mobile back button (hidden on desktop via CSS)
  if (currentPath.length > 0) {
    const backBtn = document.createElement("button");
    backBtn.className = "breadcrumb-back";
    backBtn.title = "Go back";
    backBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg> Back`;
    backBtn.addEventListener("click", () => navigateTo(currentPath.slice(0, -1)));
    breadcrumb.appendChild(backBtn);
  }

  // Home button
  const homeBtn = document.createElement("button");
  homeBtn.className = "breadcrumb-home";
  homeBtn.title = "Back to welcome screen";
  homeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
  homeBtn.addEventListener("click", goHome);
  breadcrumb.appendChild(homeBtn);

  const sep0 = document.createElement("span");
  sep0.className = "separator";
  sep0.textContent = "›";
  breadcrumb.appendChild(sep0);

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

// ── Persistent settings ──

function saveSettings(): void {
  try {
    localStorage.setItem("spacerizr-settings", JSON.stringify({
      theme: settings.theme,
      viewMode: settings.viewMode,
      particlesEnabled: settings.particlesEnabled,
      floatingEnabled: settings.floatingEnabled,
      showRelationshipLabels: settings.showRelationshipLabels,
    }));
  } catch { /* quota exceeded or private mode */ }
}

function loadSettings(): void {
  try {
    const raw = localStorage.getItem("spacerizr-settings");
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.theme === "light" || saved.theme === "dark") settings.theme = saved.theme;
    if (saved.viewMode === "2d" || saved.viewMode === "3d") settings.viewMode = saved.viewMode;
    if (typeof saved.particlesEnabled === "boolean") settings.particlesEnabled = saved.particlesEnabled;
    if (typeof saved.floatingEnabled === "boolean") settings.floatingEnabled = saved.floatingEnabled;
    if (typeof saved.showRelationshipLabels === "boolean") settings.showRelationshipLabels = saved.showRelationshipLabels;
  } catch { /* corrupted data */ }
}

let previousTheme = settings.theme;

function handleSettingsChange(): void {
  saveSettings();
  const app = document.getElementById("app")!;
  app.dataset.view = settings.viewMode;
  app.dataset.theme = settings.theme;

  // Theme changed → re-render everything with new colors
  if (settings.theme !== previousTheme) {
    previousTheme = settings.theme;
    applyTheme(sceneCtx);
    updateLegendColors();
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

// ── URL hash settings serialization ──

let suppressPopState = false;

function updateUrlHash(replace = false): void {
  const params: string[] = [];
  if (settings.theme !== "dark") params.push(`theme=${settings.theme}`);
  if (settings.viewMode !== "3d") params.push(`view=${settings.viewMode}`);
  if (currentPath.length > 0) params.push(`path=${currentPath.join(",")}`);
  const hash = params.length > 0 ? "#" + params.join("&") : "";
  if (window.location.hash !== hash) {
    suppressPopState = true;
    if (replace) {
      history.replaceState(null, "", hash || window.location.pathname + window.location.search);
    } else {
      history.pushState(null, "", hash || window.location.pathname + window.location.search);
    }
    suppressPopState = false;
  }
}

function applyUrlHash(): void {
  const hash = window.location.hash.slice(1);
  if (!hash) return;

  for (const part of hash.split("&")) {
    const [key, value] = part.split("=");
    switch (key) {
      case "theme":
        if (value === "light" || value === "dark") {
          settings.theme = value;
          previousTheme = value;
        }
        break;
      case "view":
        if (value === "2d" || value === "3d") {
          settings.viewMode = value;
        }
        break;
      case "path":
        // Applied after model loads
        break;
    }
  }
}

function getHashPath(): string[] {
  const hash = window.location.hash.slice(1);
  if (!hash) return [];
  for (const part of hash.split("&")) {
    const [key, value] = part.split("=");
    if (key === "path" && value) return value.split(",");
  }
  return [];
}

// ── URL-based model loading ──

function normalizeGitHubUrl(url: string): string {
  // Convert github.com blob URLs to raw.githubusercontent.com
  const blobMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/
  );
  if (blobMatch) {
    return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
  }
  // Convert gist URLs
  const gistMatch = url.match(
    /^https?:\/\/gist\.github\.com\/([^/]+)\/([^/]+)\/?$/
  );
  if (gistMatch) {
    return `https://gist.githubusercontent.com/${gistMatch[1]}/${gistMatch[2]}/raw`;
  }
  return url;
}

async function loadFromUrl(url: string): Promise<boolean> {
  try {
    url = normalizeGitHubUrl(url);
    const res = await fetch(url);
    if (!res.ok) return false;
    const text = await res.text();
    const isDsl = url.endsWith(".dsl") || text.trimStart().startsWith("workspace");
    const parsed = isDsl ? parseStructurizrDSL(text) : parseStructurizrJSON(text);
    loadModel(parsed);
    // Apply path from hash after loading
    const hashPath = getHashPath();
    if (hashPath.length > 0) navigateTo(hashPath);
    return true;
  } catch (err) {
    console.error("Failed to load from URL:", err);
    return false;
  }
}

function loadFromBase64(encoded: string): boolean {
  try {
    const text = atob(encoded);
    const isDsl = text.trimStart().startsWith("workspace");
    const parsed = isDsl ? parseStructurizrDSL(text) : parseStructurizrJSON(text);
    loadModel(parsed);
    return true;
  } catch (err) {
    console.error("Failed to parse base64 content:", err);
    return false;
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
      lastLoadedName = file.name;
      lastLoadedContent = text;
      lastLoadedType = isDsl ? "dsl" : "json";
      loadModel(parsed);
    } catch (err) {
      console.error("Failed to parse workspace:", err);
    }
  };
  reader.readAsText(file);
}

function loadFromText(text: string): boolean {
  try {
    const trimmed = text.trim();
    const isDsl = trimmed.startsWith("workspace") || trimmed.startsWith("model");
    const isJson = trimmed.startsWith("{");
    if (!isDsl && !isJson) return false;
    const parsed = isDsl ? parseStructurizrDSL(text) : parseStructurizrJSON(text);
    loadModel(parsed);
    return true;
  } catch (err) {
    console.error("Failed to parse pasted content:", err);
    return false;
  }
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

  // Paste-to-load (keyboard Ctrl+V)
  document.addEventListener("paste", (e) => {
    if (hasLoadedFile) return;
    const text = e.clipboardData?.getData("text");
    if (text && loadFromText(text)) {
      e.preventDefault();
    }
  });

  // Paste button for mobile (uses Clipboard API)
  document.getElementById("welcome-paste-btn")?.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && !loadFromText(text)) {
        alert("Could not parse clipboard content as DSL or JSON.");
      }
    } catch {
      alert("Clipboard access denied. Please copy your DSL/JSON first, then try again.");
    }
  });
}

// ── Keyboard navigation ──

function setupKeyboardNavigation(): void {
  document.addEventListener("keydown", (e) => {
    // Don't interfere with inputs or presentation mode
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.target instanceof HTMLSelectElement) return;
    if (isPresentationActive()) return;

    // Shortcut overlay works even without a loaded file
    if (e.key === "?") {
      e.preventDefault();
      toggleShortcutOverlay();
      return;
    }

    // Command palette
    if (e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    if (!hasLoadedFile) return;

    switch (e.key) {
      case "Backspace":
        e.preventDefault();
        if (currentPath.length > 0) {
          navigateTo(currentPath.slice(0, -1));
        }
        break;

      case "p":
      case "P":
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          enterPresentation();
        }
        break;

      case "f":
      case "F":
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          navigateTo(currentPath);
        }
        break;

      case "Escape":
        closeShortcutOverlay();
        break;
    }
  });

  // Browser back/forward
  window.addEventListener("popstate", () => {
    if (suppressPopState) return;
    if (!hasLoadedFile) return;
    const hashPath = getHashPath();
    currentPath = hashPath;
    const viewState = getViewState(model, currentPath);
    renderView(sceneCtx, viewState);
    if (is2DReady()) render2DView(viewState);
    updateBreadcrumb();
    // Don't push a new state — we're replaying history
    updateUrlHash(true);
  });
}

// ── Keyboard shortcut overlay ──

function toggleShortcutOverlay(): void {
  const existing = document.getElementById("shortcut-overlay");
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "shortcut-overlay";
  overlay.innerHTML = `
    <div class="shortcut-modal">
      <div class="shortcut-header">
        <span>Keyboard Shortcuts</span>
        <button id="shortcut-close">&times;</button>
      </div>
      <div class="shortcut-grid">
        <div class="shortcut-key">?</div><div class="shortcut-desc">Show this help</div>
        <div class="shortcut-key">P</div><div class="shortcut-desc">Enter presentation mode</div>
        <div class="shortcut-key">F</div><div class="shortcut-desc">Zoom to fit</div>
        <div class="shortcut-key">Backspace</div><div class="shortcut-desc">Go up one level</div>
        <div class="shortcut-key">Click</div><div class="shortcut-desc">Drill into element</div>
        <div class="shortcut-key">Scroll</div><div class="shortcut-desc">Zoom in/out</div>
        <div class="shortcut-key">Drag</div><div class="shortcut-desc">Rotate (3D) / Pan (2D)</div>
        <div class="shortcut-key">Ctrl+V</div><div class="shortcut-desc">Paste DSL content</div>
      </div>
      <div class="shortcut-footer">
        <span class="shortcut-section-title">In Presentation Mode</span>
      </div>
      <div class="shortcut-grid">
        <div class="shortcut-key">\u2190 \u2192</div><div class="shortcut-desc">Previous / Next slide</div>
        <div class="shortcut-key">L</div><div class="shortcut-desc">Toggle laser pointer</div>
        <div class="shortcut-key">Esc</div><div class="shortcut-desc">Exit presentation</div>
      </div>
    </div>
  `;
  document.getElementById("app")!.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById("shortcut-close")!.addEventListener("click", () => overlay.remove());
}

function closeShortcutOverlay(): void {
  document.getElementById("shortcut-overlay")?.remove();
}

// ── Command palette ──

interface FlatElement {
  element: C4Element;
  path: string[]; // parent path to navigate to
}

function getAllElementsFlat(elements: C4Element[], parentPath: string[] = []): FlatElement[] {
  const result: FlatElement[] = [];
  for (const el of elements) {
    result.push({ element: el, path: parentPath });
    if (el.children) {
      result.push(...getAllElementsFlat(el.children, [...parentPath, el.id]));
    }
  }
  return result;
}

function openCommandPalette(): void {
  if (document.getElementById("command-palette")) return;
  if (!hasLoadedFile) return;

  const allElements = getAllElementsFlat(model.elements);
  let selectedIndex = 0;

  const overlay = document.createElement("div");
  overlay.id = "command-palette";
  overlay.innerHTML = `
    <div class="cmd-modal">
      <input type="text" class="cmd-input" id="cmd-input" placeholder="Search elements..." autofocus />
      <div class="cmd-results" id="cmd-results"></div>
    </div>
  `;
  document.getElementById("app")!.appendChild(overlay);

  const input = document.getElementById("cmd-input") as HTMLInputElement;
  const resultsDiv = document.getElementById("cmd-results")!;

  function search(query: string) {
    const q = query.toLowerCase().trim();
    const matches = q === ""
      ? allElements.slice(0, 10)
      : allElements.filter((fe) => {
          const el = fe.element;
          return (
            el.name.toLowerCase().includes(q) ||
            el.type.toLowerCase().includes(q) ||
            (el.technology?.toLowerCase().includes(q) ?? false) ||
            (el.description?.toLowerCase().includes(q) ?? false)
          );
        }).slice(0, 10);

    selectedIndex = 0;
    renderResults(matches);
  }

  function renderResults(matches: FlatElement[]) {
    resultsDiv.innerHTML = matches.length === 0
      ? `<div class="cmd-empty">No elements found</div>`
      : matches.map((fe, i) => {
          const el = fe.element;
          const pathLabel = fe.path.length > 0
            ? fe.path.map((id) => getElementName(model, id) ?? id).join(" › ") + " ›"
            : "";
          const tech = el.technology ? ` · ${el.technology}` : "";
          return `<button class="cmd-result ${i === selectedIndex ? "selected" : ""}" data-index="${i}">
            <span class="cmd-result-type">${el.type}</span>
            <span class="cmd-result-name">${escapeHtml(el.name)}</span>
            <span class="cmd-result-meta">${tech}</span>
            ${pathLabel ? `<span class="cmd-result-path">${escapeHtml(pathLabel)}</span>` : ""}
          </button>`;
        }).join("");

    // Click handlers
    resultsDiv.querySelectorAll(".cmd-result").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt((btn as HTMLElement).dataset.index!);
        selectResult(matches[idx]);
      });
    });
  }

  function selectResult(fe: FlatElement) {
    overlay.remove();
    navigateTo(fe.path);
    // Spotlight the selected element briefly
    setSpotlight([fe.element.id]);
    setSpotlight3D([fe.element.id]);
    setTimeout(() => {
      clearSpotlight();
      clearSpotlight3D();
    }, 3000);
  }

  input.addEventListener("input", () => search(input.value));

  input.addEventListener("keydown", (e) => {
    const results = resultsDiv.querySelectorAll(".cmd-result");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
      results.forEach((r, i) => r.classList.toggle("selected", i === selectedIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      results.forEach((r, i) => r.classList.toggle("selected", i === selectedIndex));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const matches = getAllElementsFlat(model.elements).filter((fe) => {
        const q = input.value.toLowerCase().trim();
        if (q === "") return true;
        const el = fe.element;
        return el.name.toLowerCase().includes(q) || el.type.toLowerCase().includes(q) || (el.technology?.toLowerCase().includes(q) ?? false);
      }).slice(0, 10);
      if (matches[selectedIndex]) selectResult(matches[selectedIndex]);
    } else if (e.key === "Escape") {
      overlay.remove();
    }
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Initial search (show all)
  search("");
}

function closeCommandPalette(): void {
  document.getElementById("command-palette")?.remove();
}

// ── Init ──

function init(): void {
  const container = document.getElementById("app")!;

  // Load saved settings, then override with URL hash
  loadSettings();
  applyUrlHash();

  // Apply system theme preference at startup
  container.dataset.theme = settings.theme;

  sceneCtx = createScene(container, handleElementClick, handleElementHover);
  // Hide everything until a file is loaded — prevents flash of dark canvas
  hide3D(sceneCtx);
  startRenderLoop(sceneCtx);

  create2DScene(container, handleElementClick, handleElementHover);
  hide2D();

  createControlsPanel((format) => {
    if (format === "png") {
      exportPNG();
    } else if (format === "svg") {
      exportSVG(model, currentPath);
    } else if (format === "copy-png") {
      copyPNG();
    } else if (format === "copy-svg") {
      copySVG(model, currentPath);
    } else if (format === "zip") {
      exportAllLevelsZIP(model);
    } else if (format === "mermaid") {
      copyMermaid(model, currentPath);
    } else if (format === "plantuml") {
      copyPlantUML(model, currentPath);
    } else if (format === "html") {
      exportHTML(model, currentPath);
    } else if (format === "pdf") {
      exportPDF(model);
    }
  });
  onSettingsChange(handleSettingsChange);
  setupFileHandling();
  setupKeyboardNavigation();

  // Shortcuts button in controls header
  document.getElementById("shortcuts-btn")?.addEventListener("click", toggleShortcutOverlay);

  // Hide controls until a file is loaded — prevents flash on welcome screen
  const panel = document.getElementById("controls-panel");
  if (panel) panel.style.display = "none";
  const breadcrumb = document.getElementById("breadcrumb");
  if (breadcrumb) breadcrumb.style.display = "none";

  // Init presentation module
  initPresentation(navigateTo, () => model, () => currentPath);

  // Check URL params for model loading
  const urlParams = new URLSearchParams(window.location.search);
  const urlParam = urlParams.get("url");
  const dslParam = urlParams.get("dsl");

  if (urlParam) {
    loadFromUrl(urlParam).then((loaded) => {
      if (!loaded) showWelcomeAfterCLICheck();
    });
  } else if (dslParam) {
    if (!loadFromBase64(dslParam)) showWelcomeAfterCLICheck();
  } else {
    showWelcomeAfterCLICheck();
  }

  // Listen for fullscreen exit
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && isPresentationActive()) {
      exitPresentation();
    }
  });

  // Expose for testing (dev mode only)
  if (import.meta.env.DEV) {
    (window as any).__navigateTo = navigateTo;
  }
}

function showWelcomeAfterCLICheck(): void {
  // Check if served by CLI — if so, auto-load
  autoLoadFromCLI().then((loaded) => {
    if (!loaded) {
      // Standalone mode: show welcome screen
      hide3D(sceneCtx);
      hide2D();
      showWelcomeScreen();
    }
  });
}

function showWelcomeScreen(): void {
  // Hide controls panel and breadcrumb until a file is loaded
  const panel = document.getElementById("controls-panel");
  if (panel) panel.style.display = "none";
  const toggle = document.getElementById("controls-toggle");
  if (toggle) toggle.style.display = "none";
  const breadcrumb = document.getElementById("breadcrumb");
  if (breadcrumb) breadcrumb.style.display = "none";

  // Show feedback button on welcome screen
  const feedbackBtn = document.getElementById("feedback-btn");
  if (feedbackBtn) feedbackBtn.style.display = "";

  // Set welcome background
  document.body.style.background = settings.theme === "dark" ? "#0f0f1a" : "#f8f8f8";

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
        <div class="welcome-drop-text">${isTouchDevice() ? "Select or paste a <strong>.dsl</strong> or <strong>.json</strong> file" : "Drop a <strong>.dsl</strong> or <strong>.json</strong> workspace file here"}</div>
        <div class="welcome-drop-or">or paste DSL content (Ctrl+V)</div>
        <div class="welcome-btn-row">
          <label class="welcome-browse-btn" for="file-input">${isTouchDevice() ? "Select file" : "Browse files"}</label>
          ${isTouchDevice() ? '<button class="welcome-browse-btn welcome-paste-btn" id="welcome-paste-btn">Paste from clipboard</button>' : ""}
        </div>
      </div>
      <div class="welcome-formats">
        Supports Structurizr DSL and workspace JSON files
      </div>
      ${renderRecentSection()}
      <div class="welcome-section-title">Examples</div>
      <div class="welcome-gallery" id="welcome-gallery">
        ${examples.map((ex, i) => `
          <button class="welcome-example-card" data-example="${i}">
            <div class="example-card-name">${escapeHtml(ex.name)}</div>
            <div class="example-card-desc">${escapeHtml(ex.description)}</div>
          </button>
        `).join("")}
      </div>
    </div>
  `;
  document.getElementById("app")!.appendChild(welcome);

  // Example click handlers
  welcome.querySelectorAll(".welcome-example-card").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = parseInt((card as HTMLElement).dataset.example!);
      const ex = examples[idx];
      lastLoadedName = ex.name + ".dsl";
      lastLoadedContent = ex.dsl;
      lastLoadedType = "dsl";
      const parsed = parseStructurizrDSL(ex.dsl);
      loadModel(parsed);
    });
  });

  // Recent file click handlers
  welcome.querySelectorAll(".welcome-recent-card").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = parseInt((card as HTMLElement).dataset.recent!);
      const recent = getRecent();
      const r = recent[idx];
      if (!r) return;
      lastLoadedName = r.name;
      lastLoadedContent = r.content;
      lastLoadedType = r.type;
      const parsed = r.type === "dsl" ? parseStructurizrDSL(r.content) : parseStructurizrJSON(r.content);
      loadModel(parsed);
    });
  });
}

function renderRecentSection(): string {
  const recent = getRecent();
  if (recent.length === 0) return "";
  return `
    <div class="welcome-section-title">Recent</div>
    <div class="welcome-gallery" id="welcome-recent">
      ${recent.map((r, i) => `
        <button class="welcome-recent-card" data-recent="${i}">
          <div class="example-card-name">${escapeHtml(r.name)}</div>
          <div class="example-card-desc">${new Date(r.timestamp).toLocaleDateString()}</div>
        </button>
      `).join("")}
    </div>
  `;
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
        console.log(`File changed: ${data.file}`);
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
      html += `<div class="fb-dir-label">${escapeHtml(dir)}/</div>`;
    }
    for (const f of dirFiles) {
      const icon = f.type === "dsl" ? "{ }" : "{ }";
      const ext = f.type === "dsl" ? ".dsl" : ".json";
      const nameWithoutExt = f.name.replace(/\.(dsl|json)$/, "");
      html += `
        <button class="fb-card" data-path="${escapeHtml(f.path)}">
          <div class="fb-card-icon">${icon}</div>
          <div class="fb-card-name">${escapeHtml(nameWithoutExt)}</div>
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
  closeBtn.textContent = "\u2715";
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
