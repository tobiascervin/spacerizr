/**
 * Presentation mode — fullscreen with slide editor, speaker notes,
 * pointer toolkit, element spotlight, and smooth transitions.
 */

import { settings, notifySettingsChange } from "./settings";
import { C4Model } from "./types";
import { getViewState, hasChildren, getElementName } from "./navigation";
import { setSpotlight3D, clearSpotlight3D, getSpotlightIds3D, setPresentationMode } from "./scene";
import { setSpotlight, clearSpotlight } from "./scene2d";
import { exportPPTX } from "./pptx-export";
import { exportHTMLDeck } from "./html-deck-export";
import { activateDrawing, deactivateDrawing, destroyDrawingOverlay, setDrawSlide, isDrawingActive } from "./drawing-overlay";
import { startTour, stopTour, isTourRunning } from "./camera-tour";

export interface Slide {
  path: string[];
  annotation?: string;
  viewMode?: "2d" | "3d";
  notes?: string;
}

type PointerTool = "none" | "laser" | "spotlight";

interface PresentationState {
  active: boolean;
  slides: Slide[];
  currentSlide: number;
  toolbar: HTMLElement | null;
  overlay: HTMLElement | null;
  hideTimeout: number | null;
  pointerTool: PointerTool;
  laser: HTMLElement | null;
  spotlightOverlay: HTMLElement | null;
  focusedElementId: string | null;
  presenterChannel: BroadcastChannel | null;
  startTime: number;
}

const state: PresentationState = {
  active: false,
  slides: [],
  currentSlide: 0,
  toolbar: null,
  overlay: null,
  hideTimeout: null,
  pointerTool: "none",
  laser: null,
  spotlightOverlay: null,
  focusedElementId: null,
  presenterChannel: null,
  startTime: 0,
};

let navigateFn: ((path: string[]) => void) | null = null;
let modelFn: (() => C4Model) | null = null;
let currentPathFn: (() => string[]) | null = null;

export function initPresentation(
  navigate: (path: string[]) => void,
  getModel: () => C4Model,
  getCurrentPath: () => string[]
): void {
  navigateFn = navigate;
  modelFn = getModel;
  currentPathFn = getCurrentPath;
}

/** Auto-generate slides from model hierarchy */
function generateSlides(model: C4Model): Slide[] {
  const slides: Slide[] = [];

  // Slide 1: top-level overview
  slides.push({ path: [], annotation: model.name });

  // For each top-level element that has children, add a drill-down slide
  for (const el of model.elements) {
    if (el.children && el.children.length > 0) {
      slides.push({ path: [el.id], annotation: el.name });
      for (const child of el.children) {
        if (child.children && child.children.length > 0) {
          slides.push({ path: [el.id, child.id], annotation: child.name });
        }
      }
    }
  }

  return slides;
}

// ── Slide Editor ──

export function openSlideEditor(): void {
  if (!modelFn) return;
  const model = modelFn();

  // Generate slides if none exist
  if (state.slides.length === 0) {
    state.slides = generateSlides(model);
  }

  const modal = document.createElement("div");
  modal.id = "slide-editor-overlay";
  modal.innerHTML = `
    <div class="slide-editor-modal">
      <div class="slide-editor-header">
        <span>Edit Presentation</span>
        <button id="slide-editor-close">&times;</button>
      </div>
      <div class="slide-editor-list" id="slide-editor-list"></div>
      <div class="slide-editor-actions">
        <button class="slide-editor-btn" id="slide-add-btn">+ Add Slide</button>
        <button class="slide-editor-btn" id="slide-reset-btn">Reset to Auto</button>
      </div>
      <div class="slide-editor-footer">
        <button class="slide-editor-primary" id="slide-editor-done">Done</button>
      </div>
    </div>
  `;
  document.getElementById("app")!.appendChild(modal);

  renderSlideList(model);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  document.getElementById("slide-editor-close")!.addEventListener("click", () => modal.remove());
  document.getElementById("slide-editor-done")!.addEventListener("click", () => {
    saveDeck(model.name);
    modal.remove();
  });
  document.getElementById("slide-add-btn")!.addEventListener("click", () => {
    showAddSlideTree(model);
  });
  document.getElementById("slide-reset-btn")!.addEventListener("click", () => {
    state.slides = generateSlides(model);
    renderSlideList(model);
  });
}

function renderSlideList(model: C4Model): void {
  const list = document.getElementById("slide-editor-list");
  if (!list) return;
  list.innerHTML = "";

  state.slides.forEach((slide, i) => {
    const row = document.createElement("div");
    row.className = "slide-editor-row";
    row.draggable = true;

    const pathLabel = slide.path.length === 0
      ? model.name
      : slide.path.map((id) => getElementName(model, id) ?? id).join(" › ");

    row.innerHTML = `
      <span class="slide-drag-handle">☰</span>
      <span class="slide-number">${i + 1}</span>
      <input class="slide-annotation-input" value="${escapeAttr(slide.annotation ?? pathLabel)}" data-index="${i}" placeholder="Slide title" />
      <input class="slide-notes-input" value="${escapeAttr(slide.notes ?? "")}" data-index="${i}" placeholder="Speaker notes..." />
      <button class="slide-delete-btn" data-index="${i}">&times;</button>
    `;
    list.appendChild(row);

    // Drag handlers for reorder
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer!.setData("text/plain", String(i));
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const fromIdx = parseInt(e.dataTransfer!.getData("text/plain"));
      if (fromIdx !== i) {
        const [moved] = state.slides.splice(fromIdx, 1);
        state.slides.splice(i, 0, moved);
        renderSlideList(model);
      }
    });
  });

  // Bind inputs
  list.querySelectorAll(".slide-annotation-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      state.slides[idx].annotation = (e.target as HTMLInputElement).value;
    });
  });

  list.querySelectorAll(".slide-notes-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const idx = parseInt((e.target as HTMLInputElement).dataset.index!);
      state.slides[idx].notes = (e.target as HTMLInputElement).value;
    });
  });

  list.querySelectorAll(".slide-delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt((e.target as HTMLElement).dataset.index!);
      state.slides.splice(idx, 1);
      renderSlideList(model);
    });
  });
}

function showAddSlideTree(model: C4Model): void {
  const existing = document.getElementById("slide-add-tree");
  if (existing) { existing.remove(); return; }

  const tree = document.createElement("div");
  tree.id = "slide-add-tree";
  tree.className = "slide-add-tree";

  function addElement(el: { id?: string; name: string; children?: any[] }, path: string[], depth: number) {
    const item = document.createElement("div");
    item.className = "slide-tree-item";
    item.style.paddingLeft = `${depth * 16 + 8}px`;
    item.textContent = el.name;
    item.addEventListener("click", () => {
      state.slides.push({ path: [...path], annotation: el.name });
      renderSlideList(model);
      tree.remove();
    });
    tree.appendChild(item);

    if (el.children) {
      for (const child of el.children) {
        addElement(child, [...path, child.id], depth + 1);
      }
    }
  }

  // Root
  addElement({ name: model.name, children: model.elements as any[] }, [], 0);

  document.querySelector(".slide-editor-actions")?.after(tree);
}

function saveDeck(modelName: string): void {
  try {
    localStorage.setItem(`spacerizr-deck-${modelName}`, JSON.stringify(state.slides));
  } catch { /* quota */ }
}

function loadDeck(modelName: string): Slide[] | null {
  try {
    const raw = localStorage.getItem(`spacerizr-deck-${modelName}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Enter / Exit ──

export function enterPresentation(): void {
  if (state.active || !modelFn || !navigateFn) return;
  state.active = true;
  state.startTime = Date.now();

  const model = modelFn();

  // Load saved deck or auto-generate
  const saved = loadDeck(model.name);
  state.slides = saved ?? generateSlides(model);
  state.currentSlide = 0;

  // Find the slide matching current path
  const currentPath = currentPathFn?.() ?? [];
  const matchIdx = state.slides.findIndex(
    (s) => JSON.stringify(s.path) === JSON.stringify(currentPath)
  );
  if (matchIdx >= 0) state.currentSlide = matchIdx;

  // Set presentation mode for longer animations
  setPresentationMode(true);

  // Fullscreen
  document.documentElement.requestFullscreen?.().catch(() => {});

  // Hide UI chrome
  const hide = ["controls-panel", "controls-toggle", "breadcrumb", "top-bar", "dropzone"];
  for (const id of hide) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }

  createToolbar();
  createLaser();
  createSpotlightOverlay();
  showSlide(state.currentSlide);

  document.addEventListener("keydown", handlePresentationKey);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("click", handlePresentationClick);
  document.addEventListener("touchstart", handleTouchStart, { passive: false });
  document.addEventListener("touchend", handleTouchEnd);

  // BroadcastChannel for presenter view
  state.presenterChannel = new BroadcastChannel("spacerizr-presentation");
}

export function exitPresentation(): void {
  if (!state.active) return;
  state.active = false;

  setPresentationMode(false);
  clearSpotlight3D();
  clearSpotlight();

  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }

  // Show UI chrome
  const show = ["controls-panel", "controls-toggle", "breadcrumb"];
  for (const id of show) {
    const el = document.getElementById(id);
    if (el) el.style.display = "";
  }

  // Clean up
  state.toolbar?.remove();
  state.toolbar = null;
  state.overlay?.remove();
  state.overlay = null;
  state.laser?.remove();
  state.laser = null;
  state.spotlightOverlay?.remove();
  state.spotlightOverlay = null;
  state.pointerTool = "none";
  document.body.style.cursor = "";
  closePresenterView();
  destroyDrawingOverlay();
  if (isTourRunning()) stopTour();

  if (state.hideTimeout) clearTimeout(state.hideTimeout);
  state.presenterChannel?.close();
  state.presenterChannel = null;

  document.removeEventListener("keydown", handlePresentationKey);
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("click", handlePresentationClick);
  document.removeEventListener("touchstart", handleTouchStart);
  document.removeEventListener("touchend", handleTouchEnd);
}

// ── Toolbar ──

function createToolbar(): void {
  const toolbar = document.createElement("div");
  toolbar.id = "presentation-toolbar";
  toolbar.innerHTML = `
    <div class="pres-toolbar-inner">
      <button class="pres-btn" id="pres-prev" title="Previous (←)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="pres-counter" id="pres-counter">1 / 1</span>
      <button class="pres-btn" id="pres-next" title="Next (→)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>
      </button>
      <div class="pres-separator"></div>
      <button class="pres-btn pres-tool-btn ${state.pointerTool === "laser" ? "active" : ""}" id="pres-laser" title="Laser pointer (1)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
      </button>
      <button class="pres-btn pres-tool-btn ${state.pointerTool === "spotlight" ? "active" : ""}" id="pres-spotlight-tool" title="Spotlight (2)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="10"/></svg>
      </button>
      <div class="pres-separator"></div>
      <button class="pres-btn" id="pres-notes" title="Speaker notes (N)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></svg>
      </button>
      <button class="pres-btn" id="pres-export-html-deck" title="Export as HTML presentation">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
      </button>
      <button class="pres-btn" id="pres-export-pptx" title="Export as PowerPoint">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      </button>
      <div class="pres-separator"></div>
      <button class="pres-btn" id="pres-exit" title="Exit (Esc)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(toolbar);
  state.toolbar = toolbar;

  // Annotation overlay
  const overlay = document.createElement("div");
  overlay.id = "presentation-annotation";
  document.body.appendChild(overlay);
  state.overlay = overlay;

  // Button handlers
  document.getElementById("pres-prev")!.addEventListener("click", () => prevSlide());
  document.getElementById("pres-next")!.addEventListener("click", () => nextSlide());
  document.getElementById("pres-laser")!.addEventListener("click", () => setPointerTool(state.pointerTool === "laser" ? "none" : "laser"));
  document.getElementById("pres-spotlight-tool")!.addEventListener("click", () => setPointerTool(state.pointerTool === "spotlight" ? "none" : "spotlight"));
  document.getElementById("pres-notes")!.addEventListener("click", () => openPresenterView());
  document.getElementById("pres-export-html-deck")!.addEventListener("click", () => {
    if (modelFn) exportHTMLDeck(state.slides, modelFn(), settings.theme);
  });
  document.getElementById("pres-export-pptx")!.addEventListener("click", () => {
    if (navigateFn) exportPPTX(state.slides, navigateFn);
  });
  document.getElementById("pres-exit")!.addEventListener("click", () => exitPresentation());

  resetHideTimer();
}

// ── Pointer Tools ──

function createLaser(): void {
  const laser = document.createElement("div");
  laser.id = "presentation-laser";
  document.body.appendChild(laser);
  state.laser = laser;
}

function createSpotlightOverlay(): void {
  const overlay = document.createElement("div");
  overlay.id = "pres-spotlight-overlay";
  overlay.style.display = "none";
  document.body.appendChild(overlay);
  state.spotlightOverlay = overlay;
}

function setPointerTool(tool: PointerTool): void {
  state.pointerTool = tool;

  // Update toolbar buttons
  document.querySelectorAll(".pres-tool-btn").forEach((btn) => btn.classList.remove("active"));

  // Show/hide tool visuals
  if (state.laser) state.laser.style.display = tool === "laser" ? "block" : "none";
  if (state.spotlightOverlay) state.spotlightOverlay.style.display = tool === "spotlight" ? "block" : "none";

  document.body.style.cursor = tool === "none" ? "" : "none";

  if (tool === "laser") document.getElementById("pres-laser")?.classList.add("active");
  if (tool === "spotlight") document.getElementById("pres-spotlight-tool")?.classList.add("active");
}

// ── Speaker Notes / Presenter View ──

let presenterWindow: Window | null = null;
let presenterTimerInterval: number | null = null;

function openPresenterView(): void {
  // If already open, focus it
  if (presenterWindow && !presenterWindow.closed) {
    presenterWindow.focus();
    updatePresenterWindow();
    return;
  }

  const w = window.open("", "spacerizr-presenter", "width=500,height=400");
  if (!w) {
    // Popup blocked — show a toast with instructions
    showPresenterFallback();
    return;
  }

  presenterWindow = w;

  w.document.title = "Spacerizr — Presenter Notes";
  w.document.head.innerHTML = `<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1a1a2e; color: #e0e0e0; font-family: "Inter", -apple-system, sans-serif; padding: 24px; }
    .pv-header { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
    .pv-counter { font-size: 13px; opacity: 0.5; }
    .pv-timer { font-size: 13px; font-family: monospace; opacity: 0.5; }
    .pv-slide-title { font-size: 20px; font-weight: 600; margin-bottom: 12px; color: #818cf8; }
    .pv-notes { font-size: 16px; line-height: 1.6; white-space: pre-wrap; }
    .pv-next { margin-top: 20px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 13px; opacity: 0.4; }
  </style>`;

  updatePresenterWindow();

  // Update timer every second
  presenterTimerInterval = window.setInterval(() => {
    if (presenterWindow?.closed) {
      closePresenterView();
      return;
    }
    updatePresenterWindow();
  }, 1000);
}

function updatePresenterWindow(): void {
  if (!presenterWindow || presenterWindow.closed) return;
  const s = state.slides[state.currentSlide];
  const next = state.slides[state.currentSlide + 1];
  const el = Math.floor((Date.now() - state.startTime) / 1000);
  const min = Math.floor(el / 60);
  const sec = el % 60;

  presenterWindow.document.body.innerHTML = `
    <div class="pv-header">
      <span class="pv-counter">Slide ${state.currentSlide + 1} / ${state.slides.length}</span>
      <span class="pv-timer">${min}:${String(sec).padStart(2, "0")}</span>
    </div>
    <div class="pv-slide-title">${s?.annotation ?? ""}</div>
    <div class="pv-notes">${s?.notes ?? "(No speaker notes)"}</div>
    ${next ? `<div class="pv-next">Next: ${next.annotation ?? "—"}</div>` : ""}
  `;
}

function closePresenterView(): void {
  if (presenterTimerInterval) {
    clearInterval(presenterTimerInterval);
    presenterTimerInterval = null;
  }
  if (presenterWindow && !presenterWindow.closed) {
    presenterWindow.close();
  }
  presenterWindow = null;
}

function showPresenterFallback(): void {
  let toast = document.getElementById("copy-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "copy-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = "Allow popups for presenter notes window";
  toast.classList.add("visible");
  setTimeout(() => toast!.classList.remove("visible"), 3000);
}

// ── Slide Navigation ──

function showSlide(index: number): void {
  if (index < 0 || index >= state.slides.length || !navigateFn) return;
  state.currentSlide = index;
  const slide = state.slides[index];

  // Clear element spotlight on slide change
  clearSpotlight3D();
  clearSpotlight();

  // Sync drawing overlay to current slide
  setDrawSlide(index);

  // Update view mode if specified
  if (slide.viewMode && slide.viewMode !== settings.viewMode) {
    settings.viewMode = slide.viewMode;
    notifySettingsChange();
  }

  navigateFn(slide.path);

  // Update counter
  const counter = document.getElementById("pres-counter");
  if (counter) counter.textContent = `${index + 1} / ${state.slides.length}`;

  // Update annotation
  if (state.overlay) {
    if (slide.annotation) {
      state.overlay.textContent = slide.annotation;
      state.overlay.style.display = "block";
      state.overlay.classList.remove("fade-out");
      setTimeout(() => state.overlay?.classList.add("fade-out"), 3000);
    } else {
      state.overlay.style.display = "none";
    }
  }

  // Update presenter view if open
  updatePresenterWindow();

  // Notify presenter view
  state.presenterChannel?.postMessage({ type: "slide-change" });
}

function nextSlide(): void {
  if (state.currentSlide < state.slides.length - 1) showSlide(state.currentSlide + 1);
}

function prevSlide(): void {
  if (state.currentSlide > 0) showSlide(state.currentSlide - 1);
}

// ── Event Handlers ──

function handlePresentationKey(e: KeyboardEvent): void {
  switch (e.key) {
    case "ArrowRight":
    case " ":
    case "PageDown":
      e.preventDefault();
      nextSlide();
      break;
    case "ArrowLeft":
    case "PageUp":
      e.preventDefault();
      prevSlide();
      break;
    case "Escape":
      exitPresentation();
      break;
    case "Home":
      e.preventDefault();
      showSlide(0);
      break;
    case "End":
      e.preventDefault();
      showSlide(state.slides.length - 1);
      break;

    // Pointer tools
    case "1":
      setPointerTool(state.pointerTool === "laser" ? "none" : "laser");
      break;
    case "l":
    case "L":
      setPointerTool(state.pointerTool === "laser" ? "none" : "laser");
      break;
    case "2":
      setPointerTool(state.pointerTool === "spotlight" ? "none" : "spotlight");
      break;
    // Speaker notes
    case "n":
    case "N":
      openPresenterView();
      break;

    // Drawing overlay
    case "d":
    case "D":
      if (isDrawingActive()) {
        deactivateDrawing();
      } else {
        activateDrawing();
      }
      break;

    // Camera tour
    case "t":
    case "T":
      if (isTourRunning()) {
        stopTour();
      } else if (navigateFn) {
        startTour(state.slides, navigateFn, (idx) => showSlide(idx), () => {});
      }
      break;

    // Help overlay
    case "?":
      toggleHelpOverlay();
      break;
  }
  resetHideTimer();
}

function handleMouseMove(e: MouseEvent): void {
  if (state.toolbar) state.toolbar.classList.remove("hidden");
  resetHideTimer();

  // Laser
  if (state.pointerTool === "laser" && state.laser) {
    state.laser.style.left = e.clientX + "px";
    state.laser.style.top = e.clientY + "px";
  }

  // Spotlight overlay
  if (state.pointerTool === "spotlight" && state.spotlightOverlay) {
    state.spotlightOverlay.style.background =
      `radial-gradient(circle 100px at ${e.clientX}px ${e.clientY}px, transparent 0%, rgba(0,0,0,0.75) 100%)`;
  }
}

// ── Touch / swipe navigation ──

let swipeStartX = 0;
let swipeStartY = 0;
let swipeStartTime = 0;

function handleTouchStart(e: TouchEvent): void {
  if (e.touches.length === 1) {
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    swipeStartTime = Date.now();
  }
}

function handleTouchEnd(e: TouchEvent): void {
  if (e.changedTouches.length !== 1) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipeStartX;
  const dy = t.clientY - swipeStartY;
  const elapsed = Date.now() - swipeStartTime;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Swipe: horizontal movement > 50px, within 400ms, more horizontal than vertical
  if (absDx > 50 && elapsed < 400 && absDx > absDy * 1.5) {
    if (dx < 0) {
      // Swipe left → next slide
      if (state.currentSlide < state.slides.length - 1) showSlide(state.currentSlide + 1);
    } else {
      // Swipe right → previous slide
      if (state.currentSlide > 0) showSlide(state.currentSlide - 1);
    }
  }
}

function handlePresentationClick(_e: MouseEvent): void {
  // Element spotlight (when no pointer tool is active or using laser/spotlight)
  // This is handled by the scene's click handler which calls handleElementClick
  // We override behavior in presentation mode to toggle spotlight instead of drill-down
}

function resetHideTimer(): void {
  if (state.hideTimeout) clearTimeout(state.hideTimeout);
  state.hideTimeout = window.setTimeout(() => {
    if (state.toolbar) state.toolbar.classList.add("hidden");
  }, 3000);
}

export function isPresentationActive(): boolean {
  return state.active;
}

export function getSlides(): Slide[] {
  return state.slides;
}

export function getCurrentSlideIndex(): number {
  return state.currentSlide;
}

// ── Help overlay ──

function toggleHelpOverlay(): void {
  const existing = document.getElementById("pres-help-overlay");
  if (existing) {
    existing.remove();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "pres-help-overlay";
  overlay.innerHTML = `
    <div class="pres-help-content">
      <div class="pres-help-header">
        <span>Keyboard Shortcuts</span>
        <button class="pres-help-close" title="Close">&times;</button>
      </div>
      <div class="pres-help-grid">
        <div class="pres-help-section">
          <h3>Navigation</h3>
          <div class="pres-help-row"><kbd>&larr;</kbd><kbd>&rarr;</kbd> Navigate slides</div>
          <div class="pres-help-row"><kbd>Home</kbd><kbd>End</kbd> First / last slide</div>
          <div class="pres-help-row"><kbd>Esc</kbd> Exit presentation</div>
        </div>
        <div class="pres-help-section">
          <h3>Pointer Tools</h3>
          <div class="pres-help-row"><kbd>1</kbd> Laser pointer</div>
          <div class="pres-help-row"><kbd>2</kbd> Spotlight</div>
        </div>
        <div class="pres-help-section">
          <h3>Drawing</h3>
          <div class="pres-help-row"><kbd>D</kbd> Toggle drawing mode</div>
          <div class="pres-help-row">Pen, highlighter, eraser tools</div>
          <div class="pres-help-row">Drawings saved per slide</div>
        </div>
        <div class="pres-help-section">
          <h3>Features</h3>
          <div class="pres-help-row"><kbd>N</kbd> Presenter view &amp; notes</div>
          <div class="pres-help-row"><kbd>T</kbd> Camera fly-through tour</div>
          <div class="pres-help-row"><kbd>?</kbd> This help overlay</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".pres-help-close")!.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

/** Toggle spotlight on an element during presentation */
export function toggleElementSpotlight(elementId: string, addToSelection: boolean): void {
  if (!state.active) return;

  const ids3D = new Set(getSpotlight3DIds());
  if (addToSelection) {
    if (ids3D.has(elementId)) ids3D.delete(elementId);
    else ids3D.add(elementId);
  } else {
    if (ids3D.has(elementId) && ids3D.size === 1) {
      ids3D.clear();
    } else {
      ids3D.clear();
      ids3D.add(elementId);
    }
  }

  const arr = Array.from(ids3D);
  setSpotlight3D(arr);
  setSpotlight(arr);
}

function getSpotlight3DIds(): Set<string> {
  return getSpotlightIds3D();
}

/** Clear all spotlights */
export function clearAllSpotlights(): void {
  clearSpotlight3D();
  clearSpotlight();
}
