import { C4Element, C4Relationship, ViewState } from "./types";
import { getTheme, getElementPalette, settings } from "./settings";

interface Node2D {
  element: C4Element;
  x: number;
  y: number;
  w: number;
  h: number;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let nodes: Node2D[] = [];
let relationships: C4Relationship[] = [];
let hoveredNode: Node2D | null = null;
let panX = 0;
let panY = 0;
let zoom = 1;
let isPanning = false;
let lastMouse = { x: 0, y: 0 };
let onClickCb: ((el: C4Element) => void) | null = null;
let onHoverCb: ((el: C4Element | null, e: MouseEvent) => void) | null = null;

// Spotlight state
let spotlightIds: Set<string> = new Set();

// Animation state
let animationId: number | null = null;
let hasRenderedOnce = false;

// ── Sketch helpers ──

function sketchLine(
  c: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  wobble = 1.5
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(Math.ceil(len / 20), 2);

  c.beginPath();
  c.moveTo(x1, y1);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    c.lineTo(
      x1 + dx * t + (Math.random() - 0.5) * wobble,
      y1 + dy * t + (Math.random() - 0.5) * wobble
    );
  }
  c.stroke();
}

function sketchRoundRect(
  c: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
  wobble = 1.2
): void {
  c.beginPath();
  c.moveTo(x + r, y);

  const segs = Math.max(Math.ceil(w / 25), 3);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    c.lineTo(x + r + (w - 2 * r) * t + (Math.random() - 0.5) * wobble, y + (Math.random() - 0.5) * wobble);
  }
  c.arcTo(x + w, y, x + w, y + r, r);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    c.lineTo(x + w + (Math.random() - 0.5) * wobble, y + r + (h - 2 * r) * t + (Math.random() - 0.5) * wobble);
  }
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    c.lineTo(x + w - r - (w - 2 * r) * t + (Math.random() - 0.5) * wobble, y + h + (Math.random() - 0.5) * wobble);
  }
  c.arcTo(x, y + h, x, y + h - r, r);
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    c.lineTo(x + (Math.random() - 0.5) * wobble, y + h - r - (h - 2 * r) * t + (Math.random() - 0.5) * wobble);
  }
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

function sketchPerson(c: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  c.beginPath();
  c.arc(cx, cy - size * 0.3, size * 0.22, 0, Math.PI * 2);
  c.fill();
  c.stroke();

  c.beginPath();
  c.arc(cx, cy + size * 0.15, size * 0.35, Math.PI, 0);
  c.lineTo(cx + size * 0.35, cy + size * 0.5);
  c.lineTo(cx - size * 0.35, cy + size * 0.5);
  c.closePath();
  c.fill();
  c.stroke();
}

function drawArrow(
  c: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number
): void {
  const headLen = 12;
  const headWidth = Math.PI / 5;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  // Filled arrowhead
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - headLen * Math.cos(angle - headWidth), y2 - headLen * Math.sin(angle - headWidth));
  c.lineTo(x2 - headLen * Math.cos(angle + headWidth), y2 - headLen * Math.sin(angle + headWidth));
  c.closePath();
  c.fillStyle = c.strokeStyle as string;
  c.fill();
}

// ── 2D theme helpers ──

function getBgColor(): string {
  return settings.theme === "dark" ? "#0f0f1a" : "#fafafa";
}

function getDotColor(): string {
  return settings.theme === "dark" ? "#2a2a4a" : "#e0e0e0";
}

function getRelLineColor(): string {
  return settings.theme === "dark" ? "#6366f1" : "#6366f1";
}

function getRelLabelColor(): string {
  return settings.theme === "dark" ? "rgba(180,190,255,0.6)" : "#64748b";
}

// ── Main render ──

function render(): void {
  if (!canvas || !ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = getBgColor();
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  // Dot grid
  const gridSize = 30;
  const startX = Math.floor(-panX / zoom / gridSize) * gridSize - gridSize;
  const startY = Math.floor(-panY / zoom / gridSize) * gridSize - gridSize;
  const endX = startX + w / zoom + gridSize * 2;
  const endY = startY + h / zoom + gridSize * 2;

  ctx.fillStyle = getDotColor();
  for (let gx = startX; gx < endX; gx += gridSize) {
    for (let gy = startY; gy < endY; gy += gridSize) {
      ctx.fillRect(gx - 1, gy - 1, 2, 2);
    }
  }

  // Relationships
  const relColor = getRelLineColor();
  const relLabelColor = getRelLabelColor();
  const labelBgColor = getBgColor();

  // Count edges between same node pairs for perpendicular offset
  const edgeCounts = new Map<string, number>();
  const edgeIndex = new Map<string, number>();
  for (const rel of relationships) {
    const key = [rel.sourceId, rel.destinationId].sort().join(":");
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  }

  // Obstacles: nodes + already-placed labels
  const obstacles: { x: number; y: number; w: number; h: number }[] = nodes.map((n) => ({
    x: n.x, y: n.y, w: n.w, h: n.h,
  }));

  function rectOverlap(
    ax: number, ay: number, aw: number, ah: number,
    bx: number, by: number, bw: number, bh: number
  ): number {
    const ox = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
    const oy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
    return ox * oy;
  }

  const LABEL_MARGIN = 6; // minimum gap between labels and obstacles

  function totalOverlap(lx: number, ly: number, lw: number, lh: number): number {
    let total = 0;
    for (const o of obstacles) {
      // Add margin around obstacles so labels don't sit edge-to-edge
      total += rectOverlap(
        lx, ly, lw, lh,
        o.x - LABEL_MARGIN, o.y - LABEL_MARGIN,
        o.w + LABEL_MARGIN * 2, o.h + LABEL_MARGIN * 2
      );
    }
    return total;
  }

  for (const rel of relationships) {
    const fromNode = nodes.find((n) => n.element.id === rel.sourceId);
    const toNode = nodes.find((n) => n.element.id === rel.destinationId);
    if (!fromNode || !toNode) continue;

    const key = [rel.sourceId, rel.destinationId].sort().join(":");
    const total = edgeCounts.get(key) ?? 1;
    const idx = edgeIndex.get(key) ?? 0;
    edgeIndex.set(key, idx + 1);

    const fx = fromNode.x + fromNode.w / 2;
    const fy = fromNode.y + fromNode.h / 2;
    const tx = toNode.x + toNode.w / 2;
    const ty = toNode.y + toNode.h / 2;

    // Perpendicular offset for parallel edges between same pair
    const dx = tx - fx;
    const dy = ty - fy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len;
    const perpY = dx / len;
    const offsetAmount = (idx - (total - 1) / 2) * 28;
    const ox = perpX * offsetAmount;
    const oy = perpY * offsetAmount;

    ctx.strokeStyle = relColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([8, 5]);
    sketchLine(ctx, fx + ox, fy + oy, tx + ox, ty + oy, 0.8);
    ctx.setLineDash([]);
    drawArrow(ctx, fx + ox, fy + oy, tx + ox, ty + oy);
    ctx.globalAlpha = 1;

    if (rel.description && settings.showRelationshipLabels) {
      ctx.font = '11px "Inter", sans-serif';
      const textW = ctx.measureText(rel.description).width;
      const textH = 14;
      const pad = 4;
      const lw = textW + pad * 2;
      const lh = textH + 4;

      // Try positions along the line + perpendicular offsets to avoid nodes & other labels
      let bestX = fx + dx * 0.5 + ox;
      let bestY = fy + dy * 0.5 + oy - 10;
      let bestScore = Infinity;

      const tValues = [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85];
      const perpOffsets = [0, -22, 22, -44, 44, -66, 66];

      for (const t of tValues) {
        for (const po of perpOffsets) {
          const cx = fx + dx * t + ox + perpX * po;
          const cy = fy + dy * t + oy + perpY * po - 10;
          const lx = cx - textW / 2 - pad;
          const ly = cy - textH - 2;

          const score = totalOverlap(lx, ly, lw, lh);
          if (score < bestScore) {
            bestScore = score;
            bestX = cx;
            bestY = cy;
            if (score === 0) break;
          }
        }
        if (bestScore === 0) break;
      }

      // Background pill behind label
      const bgX = bestX - textW / 2 - pad;
      const bgY = bestY - textH - 2;
      ctx.fillStyle = labelBgColor;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(bgX, bgY, lw, lh, 4);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Register as obstacle so future labels avoid it
      obstacles.push({ x: bgX, y: bgY, w: lw, h: lh });

      ctx.fillStyle = relLabelColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(rel.description, bestX, bestY);
    }
  }

  // Nodes
  const hasSpotlight = spotlightIds.size > 0;

  for (const node of nodes) {
    const style = getElementPalette(node.element);
    const isHovered = hoveredNode === node;
    const isDimmed = hasSpotlight && !spotlightIds.has(node.element.id);

    if (isDimmed) ctx.globalAlpha = 0.15;

    if (node.element.type === "person") {
      const cx = node.x + node.w / 2;
      const cy = node.y + node.h * 0.35;

      ctx.fillStyle = style.fill;
      ctx.strokeStyle = style.border;
      ctx.lineWidth = isHovered ? 2.5 : 1.8;
      sketchPerson(ctx, cx, cy, node.h * 0.45);

      ctx.font = 'bold 14px "Inter", sans-serif';
      ctx.fillStyle = style.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(node.element.name, cx, node.y + node.h * 0.72);
    } else {
      ctx.fillStyle = style.fill;
      ctx.strokeStyle = style.border;
      ctx.lineWidth = isHovered ? 2.5 : 1.8;

      sketchRoundRect(ctx, node.x, node.y, node.w, node.h, 8);
      ctx.fill();
      ctx.stroke();

      if (node.element.children && node.element.children.length > 0) {
        ctx.strokeStyle = style.border;
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.3;
        sketchRoundRect(ctx, node.x + 4, node.y + 4, node.w - 8, node.h - 8, 6);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.font = 'bold 14px "Inter", sans-serif';
      ctx.fillStyle = style.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(node.element.name, node.x + node.w / 2, node.y + node.h * 0.38);

      if (node.element.technology) {
        ctx.font = '11px "Inter", sans-serif';
        ctx.fillStyle = style.border;
        ctx.fillText(`[${node.element.technology}]`, node.x + node.w / 2, node.y + node.h * 0.58);
      }

      if (node.element.description) {
        ctx.font = '11px "Inter", sans-serif';
        ctx.fillStyle = style.text + "99";
        const maxChars = Math.floor(node.w / 7);
        let desc = node.element.description;
        if (desc.length > maxChars) desc = desc.slice(0, maxChars - 1) + "...";
        ctx.fillText(desc, node.x + node.w / 2, node.y + node.h * 0.78);
      }
    }

    if (isDimmed) ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── Hit testing ──

function screenToWorld(sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
}

function hitTest(sx: number, sy: number): Node2D | null {
  const { x, y } = screenToWorld(sx, sy);
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) return n;
  }
  return null;
}

// ── Public API ──

export function create2DScene(
  container: HTMLElement,
  onClickCallback: (el: C4Element) => void,
  onHoverCallback: (el: C4Element | null, e: MouseEvent) => void
): void {
  onClickCb = onClickCallback;
  onHoverCb = onHoverCallback;

  canvas = document.createElement("canvas");
  canvas.id = "canvas-2d";
  canvas.style.cssText = "width:100%;height:100%;display:block;cursor:grab;";
  container.appendChild(canvas);
  ctx = canvas.getContext("2d")!;

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      isPanning = true;
      lastMouse = { x: e.clientX, y: e.clientY };
      canvas!.style.cursor = "grabbing";
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (isPanning) {
      panX += e.clientX - lastMouse.x;
      panY += e.clientY - lastMouse.y;
      lastMouse = { x: e.clientX, y: e.clientY };
      render();
    }
    const rect = canvas!.getBoundingClientRect();
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hit !== hoveredNode) {
      hoveredNode = hit;
      canvas!.style.cursor = hit ? "pointer" : isPanning ? "grabbing" : "grab";
      render();
    }
    onHoverCb?.(hit?.element ?? null, e);
  });

  canvas.addEventListener("mouseup", () => {
    isPanning = false;
    canvas!.style.cursor = hoveredNode ? "pointer" : "grab";
  });

  canvas.addEventListener("click", (e) => {
    if (hoveredNode && onClickCb) {
      const rect = canvas!.getBoundingClientRect();
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) onClickCb(hit.element);
    }
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldZoom = zoom;
    zoom = Math.max(0.2, Math.min(3, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    panX = mx - (mx - panX) * (zoom / oldZoom);
    panY = my - (my - panY) * (zoom / oldZoom);
    render();
  }, { passive: false });

  window.addEventListener("resize", render);
}

/** Measure how wide a node needs to be for its text content */
function measureNodeWidth(el: C4Element): number {
  if (!ctx) return 180;
  const MIN_W = 140;
  const PAD = 40;

  ctx.font = 'bold 14px "Inter", sans-serif';
  const nameW = ctx.measureText(el.name).width;

  let techW = 0;
  if (el.technology) {
    ctx.font = '11px "Inter", sans-serif';
    techW = ctx.measureText(`[${el.technology}]`).width;
  }

  let descW = 0;
  if (el.description) {
    ctx.font = '11px "Inter", sans-serif';
    descW = ctx.measureText(el.description).width;
    // Cap description width — it wraps visually anyway
    descW = Math.min(descW, 220);
  }

  return Math.max(MIN_W, Math.max(nameW, techW, descW) + PAD);
}

export function render2DView(viewState: ViewState): void {
  if (!canvas || !ctx) return;

  const elements = viewState.visibleElements;
  if (elements.length === 0) {
    nodes = [];
    relationships = viewState.visibleRelationships;
    render();
    return;
  }

  const NODE_H = 110;
  const MIN_GAP_X = 60;
  const GAP_Y = 100;

  // Separate persons from others (same grouping as layout.ts)
  const persons = elements.filter((e) => e.type === "person");
  const others = elements.filter((e) => e.type !== "person");

  const rowElements: C4Element[][] = [];
  if (persons.length > 0) rowElements.push(persons);
  if (others.length > 0) {
    const cols = Math.max(Math.ceil(Math.sqrt(others.length)), persons.length);
    for (let i = 0; i < others.length; i += cols) {
      rowElements.push(others.slice(i, i + cols));
    }
  }

  // Measure all node widths
  const widths = new Map<string, number>();
  for (const el of elements) {
    widths.set(el.id, measureNodeWidth(el));
  }

  // Compute minimum gap needed: widest relationship label + padding
  const rels = viewState.visibleRelationships;
  let maxRelLabelW = 0;
  ctx.font = '11px "Inter", sans-serif';
  for (const rel of rels) {
    if (rel.description) {
      maxRelLabelW = Math.max(maxRelLabelW, ctx.measureText(rel.description).width);
    }
  }
  const GAP_X = Math.max(MIN_GAP_X, maxRelLabelW + 30);

  // Layout each row, centering horizontally
  nodes = [];
  let totalHeight = rowElements.length * NODE_H + (rowElements.length - 1) * GAP_Y;
  let currentY = -totalHeight / 2;

  for (const row of rowElements) {
    // Total width of this row
    const rowWidths = row.map((el) => widths.get(el.id) ?? 180);
    const totalRowW = rowWidths.reduce((s, w) => s + w, 0) + (row.length - 1) * GAP_X;

    let currentX = -totalRowW / 2;
    for (let c = 0; c < row.length; c++) {
      const w = rowWidths[c];
      nodes.push({
        element: row[c],
        x: currentX,
        y: currentY,
        w,
        h: NODE_H,
      });
      currentX += w + GAP_X;
    }
    currentY += NODE_H + GAP_Y;
  }

  relationships = viewState.visibleRelationships;

  // Center view on nodes
  const centerX = canvas.clientWidth / 2;
  const centerY = canvas.clientHeight / 2;
  const avgX = nodes.reduce((s, n) => s + n.x + n.w / 2, 0) / nodes.length;
  const avgY = nodes.reduce((s, n) => s + n.y + n.h / 2, 0) / nodes.length;
  const targetPanX = centerX - avgX * zoom;
  const targetPanY = centerY - avgY * zoom;

  if (!hasRenderedOnce) {
    // First render — no animation
    panX = targetPanX;
    panY = targetPanY;
    hasRenderedOnce = true;
    render();
  } else {
    // Smooth transition
    render(); // render new nodes immediately at old position
    animateTo(targetPanX, targetPanY, zoom, 350);
  }
}

/** Re-render with current theme */
export function refresh2D(): void {
  render();
}

export function show2D(): void {
  if (canvas) canvas.style.display = "block";
}

export function hide2D(): void {
  if (canvas) canvas.style.display = "none";
}

export function is2DReady(): boolean {
  return canvas !== null;
}

// ── Smooth animation ──

export function animateTo(targetPanX: number, targetPanY: number, targetZoom: number, duration = 400): void {
  if (!canvas) return;
  if (animationId) cancelAnimationFrame(animationId);

  const startPanX = panX;
  const startPanY = panY;
  const startZoom = zoom;
  const startTime = performance.now();

  function step(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out

    panX = startPanX + (targetPanX - startPanX) * ease;
    panY = startPanY + (targetPanY - startPanY) * ease;
    zoom = startZoom + (targetZoom - startZoom) * ease;

    render();

    if (progress < 1) {
      animationId = requestAnimationFrame(step);
    } else {
      animationId = null;
    }
  }
  animationId = requestAnimationFrame(step);
}

// ── Spotlight ──

export function setSpotlight(ids: string[]): void {
  spotlightIds = new Set(ids);
  render();
}

export function clearSpotlight(): void {
  spotlightIds.clear();
  render();
}

export function getSpotlightIds(): Set<string> {
  return spotlightIds;
}
