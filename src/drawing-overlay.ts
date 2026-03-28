/**
 * Drawing overlay for presentation mode.
 * Transparent canvas on top of the viewer for freehand drawing.
 */

export type DrawTool = "pen" | "highlighter" | "eraser";

interface DrawPath {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  opacity: number;
}

interface DrawingState {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  active: boolean;
  tool: DrawTool;
  isDrawing: boolean;
  currentPath: DrawPath | null;
  pathsBySlide: Map<number, DrawPath[]>;
  currentSlide: number;
  toolbox: HTMLElement | null;
}

const state: DrawingState = {
  canvas: null,
  ctx: null,
  active: false,
  tool: "pen",
  isDrawing: false,
  currentPath: null,
  pathsBySlide: new Map(),
  currentSlide: 0,
  toolbox: null,
};

const TOOL_SETTINGS: Record<DrawTool, { color: string; width: number; opacity: number }> = {
  pen: { color: "#ff4444", width: 3, opacity: 1 },
  highlighter: { color: "#ffd700", width: 24, opacity: 0.3 },
  eraser: { color: "", width: 20, opacity: 1 },
};

export function initDrawingOverlay(): void {
  if (state.canvas) return;

  const canvas = document.createElement("canvas");
  canvas.id = "drawing-overlay";
  canvas.style.cssText = `
    position: fixed; inset: 0; z-index: 9998;
    pointer-events: none; cursor: crosshair;
  `;
  document.body.appendChild(canvas);
  state.canvas = canvas;
  state.ctx = canvas.getContext("2d")!;

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}

function resizeCanvas(): void {
  if (!state.canvas) return;
  state.canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
  state.canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
  state.canvas.style.width = window.innerWidth + "px";
  state.canvas.style.height = window.innerHeight + "px";
  redraw();
}

export function activateDrawing(): void {
  if (!state.canvas) initDrawingOverlay();
  state.active = true;
  state.canvas!.style.pointerEvents = "auto";
  state.canvas!.style.cursor = "crosshair";

  state.canvas!.addEventListener("mousedown", handleDown);
  state.canvas!.addEventListener("mousemove", handleMove);
  state.canvas!.addEventListener("mouseup", handleUp);
  state.canvas!.addEventListener("touchstart", handleTouchDown, { passive: false });
  state.canvas!.addEventListener("touchmove", handleTouchMove, { passive: false });
  state.canvas!.addEventListener("touchend", handleTouchUp);

  showToolbox();
}

export function deactivateDrawing(): void {
  state.active = false;
  if (state.canvas) {
    state.canvas.style.pointerEvents = "none";
    state.canvas.removeEventListener("mousedown", handleDown);
    state.canvas.removeEventListener("mousemove", handleMove);
    state.canvas.removeEventListener("mouseup", handleUp);
    state.canvas.removeEventListener("touchstart", handleTouchDown);
    state.canvas.removeEventListener("touchmove", handleTouchMove);
    state.canvas.removeEventListener("touchend", handleTouchUp);
  }
  hideToolbox();
}

export function destroyDrawingOverlay(): void {
  deactivateDrawing();
  state.canvas?.remove();
  state.canvas = null;
  state.ctx = null;
  state.pathsBySlide.clear();
}

export function setDrawSlide(slideIndex: number): void {
  state.currentSlide = slideIndex;
  redraw();
}

export function setDrawTool(tool: DrawTool): void {
  state.tool = tool;
  if (state.canvas) {
    state.canvas.style.cursor = tool === "eraser" ? "grab" : "crosshair";
  }
  updateToolboxButtons();
}

export function clearSlideDrawings(): void {
  state.pathsBySlide.delete(state.currentSlide);
  redraw();
}

export function isDrawingActive(): boolean {
  return state.active;
}

// ── Event handlers ──

function handleDown(e: MouseEvent): void {
  if (state.tool === "eraser") {
    eraseAt(e.clientX, e.clientY);
    return;
  }
  state.isDrawing = true;
  const settings = TOOL_SETTINGS[state.tool];
  state.currentPath = {
    points: [{ x: e.clientX, y: e.clientY }],
    color: settings.color,
    width: settings.width,
    opacity: settings.opacity,
  };
}

function handleMove(e: MouseEvent): void {
  if (state.tool === "eraser" && e.buttons === 1) {
    eraseAt(e.clientX, e.clientY);
    return;
  }
  if (!state.isDrawing || !state.currentPath || !state.ctx) return;
  state.currentPath.points.push({ x: e.clientX, y: e.clientY });
  drawPathIncremental(state.currentPath);
}

function handleUp(): void {
  if (!state.isDrawing || !state.currentPath) return;
  state.isDrawing = false;

  if (state.currentPath.points.length > 1) {
    if (!state.pathsBySlide.has(state.currentSlide)) {
      state.pathsBySlide.set(state.currentSlide, []);
    }
    state.pathsBySlide.get(state.currentSlide)!.push(state.currentPath);
  }
  state.currentPath = null;
}

function eraseAt(x: number, y: number): void {
  const paths = state.pathsBySlide.get(state.currentSlide);
  if (!paths) return;
  const radius = 15;
  const before = paths.length;
  const filtered = paths.filter((path) => {
    return !path.points.some((p) => Math.hypot(p.x - x, p.y - y) < radius);
  });
  if (filtered.length < before) {
    state.pathsBySlide.set(state.currentSlide, filtered);
    redraw();
  }
}

// ── Touch adapters ──

function handleTouchDown(e: TouchEvent): void {
  e.preventDefault();
  if (e.touches.length === 1) {
    handleDown({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, buttons: 1 } as MouseEvent);
  }
}

function handleTouchMove(e: TouchEvent): void {
  e.preventDefault();
  if (e.touches.length === 1) {
    handleMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, buttons: 1 } as MouseEvent);
  }
}

function handleTouchUp(): void {
  handleUp();
}

// ── Rendering ──

function drawPathIncremental(path: DrawPath): void {
  if (!state.ctx || path.points.length < 2) return;
  const dpr = window.devicePixelRatio || 1;
  const ctx = state.ctx;
  const pts = path.points;
  const last = pts.length - 1;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = path.color;
  ctx.lineWidth = path.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = path.opacity;
  ctx.beginPath();
  ctx.moveTo(pts[last - 1].x, pts[last - 1].y);
  ctx.lineTo(pts[last].x, pts[last].y);
  ctx.stroke();
  ctx.restore();
}

function redraw(): void {
  if (!state.ctx || !state.canvas) return;
  const dpr = window.devicePixelRatio || 1;
  state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);

  const paths = state.pathsBySlide.get(state.currentSlide) ?? [];
  for (const path of paths) {
    if (path.points.length < 2) continue;
    state.ctx.save();
    state.ctx.scale(dpr, dpr);
    state.ctx.strokeStyle = path.color;
    state.ctx.lineWidth = path.width;
    state.ctx.lineCap = "round";
    state.ctx.lineJoin = "round";
    state.ctx.globalAlpha = path.opacity;
    state.ctx.beginPath();
    state.ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      state.ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    state.ctx.stroke();
    state.ctx.restore();
  }
}

// ── Toolbox UI ──

function showToolbox(): void {
  if (state.toolbox) return;
  const box = document.createElement("div");
  box.id = "drawing-toolbox";
  box.innerHTML = `
    <button class="draw-tool-btn active" data-tool="pen" title="Pen">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
    </button>
    <button class="draw-tool-btn" data-tool="highlighter" title="Highlighter">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="6" rx="1"/><path d="M7 11V7l5-4 5 4v4"/></svg>
    </button>
    <button class="draw-tool-btn" data-tool="eraser" title="Eraser">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20H7L3 16l9-9 8 8-4 4"/><path d="M18 13l-1.5-1.5"/></svg>
    </button>
    <div class="draw-separator"></div>
    <button class="draw-tool-btn" id="draw-clear" title="Clear all">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;
  document.body.appendChild(box);
  state.toolbox = box;

  box.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setDrawTool((btn as HTMLElement).dataset.tool as DrawTool);
    });
  });

  document.getElementById("draw-clear")!.addEventListener("click", clearSlideDrawings);
}

function hideToolbox(): void {
  state.toolbox?.remove();
  state.toolbox = null;
}

function updateToolboxButtons(): void {
  state.toolbox?.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", (btn as HTMLElement).dataset.tool === state.tool);
  });
}
