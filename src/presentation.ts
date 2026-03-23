/**
 * Presentation mode — fullscreen with auto-hiding toolbar,
 * story/slide navigation, focus mode, and laser pointer.
 */

import { settings, notifySettingsChange } from "./settings";
import { C4Model, ViewState } from "./types";
import { getViewState, hasChildren, getElementName } from "./navigation";

export interface Slide {
  path: string[];
  annotation?: string;
  viewMode?: "2d" | "3d";
}

interface PresentationState {
  active: boolean;
  slides: Slide[];
  currentSlide: number;
  toolbar: HTMLElement | null;
  overlay: HTMLElement | null;
  hideTimeout: number | null;
  laserEnabled: boolean;
  laser: HTMLElement | null;
  focusedElementId: string | null;
}

const state: PresentationState = {
  active: false,
  slides: [],
  currentSlide: 0,
  toolbar: null,
  overlay: null,
  hideTimeout: null,
  laserEnabled: false,
  laser: null,
  focusedElementId: null,
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
      slides.push({
        path: [el.id],
        annotation: el.name,
      });
      // Go one more level deep
      for (const child of el.children) {
        if (child.children && child.children.length > 0) {
          slides.push({
            path: [el.id, child.id],
            annotation: child.name,
          });
        }
      }
    }
  }

  return slides;
}

export function enterPresentation(): void {
  if (state.active || !modelFn || !navigateFn) return;
  state.active = true;

  const model = modelFn();
  state.slides = generateSlides(model);
  state.currentSlide = 0;

  // Find the slide matching current path
  const currentPath = currentPathFn?.() ?? [];
  const matchIdx = state.slides.findIndex(
    (s) => JSON.stringify(s.path) === JSON.stringify(currentPath)
  );
  if (matchIdx >= 0) state.currentSlide = matchIdx;

  // Fullscreen
  document.documentElement.requestFullscreen?.().catch(() => {});

  // Hide UI chrome
  const hide = ["controls-panel", "controls-toggle", "breadcrumb", "top-bar", "dropzone"];
  for (const id of hide) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }

  // Create toolbar
  createToolbar();
  createLaser();
  showSlide(state.currentSlide);

  // Key handlers
  document.addEventListener("keydown", handlePresentationKey);
  document.addEventListener("mousemove", handleMouseMove);
}

export function exitPresentation(): void {
  if (!state.active) return;
  state.active = false;

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

  if (state.hideTimeout) clearTimeout(state.hideTimeout);
  document.removeEventListener("keydown", handlePresentationKey);
  document.removeEventListener("mousemove", handleMouseMove);
}

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
      <button class="pres-btn" id="pres-laser" title="Laser pointer (L)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
      </button>
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
  document.getElementById("pres-laser")!.addEventListener("click", () => toggleLaser());
  document.getElementById("pres-exit")!.addEventListener("click", () => exitPresentation());

  // Auto-hide after 3s
  resetHideTimer();
}

function createLaser(): void {
  const laser = document.createElement("div");
  laser.id = "presentation-laser";
  document.body.appendChild(laser);
  state.laser = laser;
}

function toggleLaser(): void {
  state.laserEnabled = !state.laserEnabled;
  const btn = document.getElementById("pres-laser");
  if (btn) btn.classList.toggle("active", state.laserEnabled);
  if (state.laser) state.laser.style.display = state.laserEnabled ? "block" : "none";
  document.body.style.cursor = state.laserEnabled ? "none" : "";
}

function showSlide(index: number): void {
  if (index < 0 || index >= state.slides.length || !navigateFn) return;
  state.currentSlide = index;
  const slide = state.slides[index];

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
      // Fade out after 3s
      state.overlay.classList.remove("fade-out");
      setTimeout(() => state.overlay?.classList.add("fade-out"), 3000);
    } else {
      state.overlay.style.display = "none";
    }
  }
}

function nextSlide(): void {
  if (state.currentSlide < state.slides.length - 1) {
    showSlide(state.currentSlide + 1);
  }
}

function prevSlide(): void {
  if (state.currentSlide > 0) {
    showSlide(state.currentSlide - 1);
  }
}

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
    case "l":
    case "L":
      toggleLaser();
      break;
    case "Home":
      e.preventDefault();
      showSlide(0);
      break;
    case "End":
      e.preventDefault();
      showSlide(state.slides.length - 1);
      break;
  }
  resetHideTimer();
}

function handleMouseMove(e: MouseEvent): void {
  // Show toolbar
  if (state.toolbar) {
    state.toolbar.classList.remove("hidden");
  }
  resetHideTimer();

  // Move laser
  if (state.laserEnabled && state.laser) {
    state.laser.style.left = e.clientX + "px";
    state.laser.style.top = e.clientY + "px";
  }
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
