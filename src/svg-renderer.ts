/**
 * Pure SVG renderer for C4 models.
 * No DOM dependencies — works in Node.js and browsers.
 */

import { C4Element, C4Model, ViewState, getElementShape, C4Shape } from "./types";

// ── Theme palettes (self-contained, no settings dependency) ──

export interface SvgThemePalette {
  bg: string;
  relColor: string;
  relLabelColor: string;
  element: Record<string, { fill: string; border: string; text: string }>;
}

const LIGHT_PALETTE: SvgThemePalette = {
  bg: "#f8f8f8",
  relColor: "rgba(100,116,139,0.35)",
  relLabelColor: "#64748b",
  element: {
    person:         { fill: "#dbeafe", border: "#3b82f6", text: "#1e3a5f" },
    softwareSystem: { fill: "#e0e7ff", border: "#6366f1", text: "#312e81" },
    container:      { fill: "#ede9fe", border: "#8b5cf6", text: "#4c1d95" },
    component:      { fill: "#f3e8ff", border: "#a78bfa", text: "#581c87" },
    external:       { fill: "#f1f5f9", border: "#94a3b8", text: "#475569" },
  },
};

const DARK_PALETTE: SvgThemePalette = {
  bg: "#0f0f1a",
  relColor: "rgba(100,140,200,0.4)",
  relLabelColor: "#8899bb",
  element: {
    person:         { fill: "#1e3a5f", border: "#60a5fa", text: "#dbeafe" },
    softwareSystem: { fill: "#2e1065", border: "#818cf8", text: "#e0e7ff" },
    container:      { fill: "#3b0764", border: "#a78bfa", text: "#ede9fe" },
    component:      { fill: "#4c1d95", border: "#c4b5fd", text: "#f3e8ff" },
    external:       { fill: "#1e293b", border: "#64748b", text: "#e2e8f0" },
  },
};

export function getSvgPalette(theme: "light" | "dark"): SvgThemePalette {
  return theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
}

// ── Helpers ──

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

function tw(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
}

function r(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

// ── Box layout types ──

interface Box {
  el: C4Element;
  x: number;
  y: number;
  w: number;
  h: number;
  kids: Box[];
  depth: number;
}

const PAD = 28;
const GAP = 24;
const HDR = 55;
const LEAF_H = 90;
const MIN_W = 150;

function sizeBox(el: C4Element, depth = 0): Box {
  if (!el.children || el.children.length === 0) {
    const nameW = tw(el.name, 12);
    const techW = el.technology ? tw(`[${el.technology}]`, 9) : 0;
    const descW = el.description ? tw(truncate(el.description, 40), 8.5) : 0;
    const w = Math.max(MIN_W, Math.max(nameW, techW, descW) + 40);
    return { el, x: 0, y: 0, w, h: LEAF_H, kids: [], depth };
  }

  const kids = el.children.map((c) => sizeBox(c, depth + 1));
  const n = kids.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  const colW: number[] = new Array(cols).fill(0);
  const rowH: number[] = new Array(rows).fill(0);
  for (let i = 0; i < n; i++) {
    colW[i % cols] = Math.max(colW[i % cols], kids[i].w);
    rowH[Math.floor(i / cols)] = Math.max(rowH[Math.floor(i / cols)], kids[i].h);
  }

  const kidsW = colW.reduce((s, w) => s + w, 0) + (cols - 1) * GAP;
  const kidsH = rowH.reduce((s, h) => s + h, 0) + (rows - 1) * GAP;

  let cy = HDR + PAD;
  for (let ri = 0; ri < rows; ri++) {
    let cx = PAD;
    for (let c = 0; c < cols; c++) {
      const idx = ri * cols + c;
      if (idx >= n) break;
      kids[idx].x = cx + (colW[c] - kids[idx].w) / 2;
      kids[idx].y = cy + (rowH[ri] - kids[idx].h) / 2;
      cx += colW[c] + GAP;
    }
    cy += rowH[ri] + GAP;
  }

  const nameW = tw(el.name, 14);
  const techW = el.technology ? tw(`[${el.technology}]`, 10) : 0;
  const headerW = Math.max(nameW, techW) + 60;
  const totalW = Math.max(headerW, kidsW + PAD * 2);
  const totalH = HDR + PAD + kidsH + PAD;

  return { el, x: 0, y: 0, w: totalW, h: totalH, kids, depth };
}

function palFill(el: C4Element, palette: SvgThemePalette): string {
  if (el.color === "#999999" || el.tags?.includes("External")) return palette.element.external.fill;
  return (palette.element[el.type] || palette.element.softwareSystem).fill;
}

function palBorder(el: C4Element, palette: SvgThemePalette): string {
  if (el.color === "#999999" || el.tags?.includes("External")) return palette.element.external.border;
  return (palette.element[el.type] || palette.element.softwareSystem).border;
}

function palText(el: C4Element, palette: SvgThemePalette): string {
  if (el.color === "#999999" || el.tags?.includes("External")) return palette.element.external.text;
  return (palette.element[el.type] || palette.element.softwareSystem).text;
}

function drawBox(box: Box, ox: number, oy: number, out: string[], isDark: boolean, palette: SvgThemePalette): void {
  const x = Math.round(ox + box.x);
  const y = Math.round(oy + box.y);
  const w = Math.round(box.w);
  const h = Math.round(box.h);
  const fill = palFill(box.el, palette);
  const border = palBorder(box.el, palette);
  const text = palText(box.el, palette);
  const hasKids = box.kids.length > 0;

  if (box.el.type === "person") {
    const cx = x + w / 2;
    const iy = y + 16;
    out.push(`<circle cx="${r(cx)}" cy="${iy}" r="14" fill="${fill}" stroke="${border}" stroke-width="1.5"/>`);
    out.push(`<path d="M${r(cx - 16)},${iy + 30} Q${r(cx - 16)},${iy + 14} ${r(cx)},${iy + 14} Q${r(cx + 16)},${iy + 14} ${r(cx + 16)},${iy + 30} Z" fill="${fill}" stroke="${border}" stroke-width="1.5"/>`);
    out.push(`<text x="${r(cx)}" y="${y + 64}" text-anchor="middle" font-size="13" font-weight="600" fill="${text}">${esc(box.el.name)}</text>`);
    if (box.el.description) {
      out.push(`<text x="${r(cx)}" y="${y + 78}" text-anchor="middle" font-size="9" fill="${text}" opacity="0.5">${esc(truncate(box.el.description, 40))}</text>`);
    }
    return;
  }

  const cornerR = hasKids ? 12 : 8;
  const shape = getElementShape(box.el);

  if (hasKids) {
    const opacity = box.depth === 0 ? "0.12" : "0.18";
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${cornerR}" fill="${fill}" fill-opacity="${opacity}" stroke="${border}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
  } else {
    out.push(svgShapeShadow(shape, x, y, w, h, cornerR, isDark));
    out.push(svgShape(shape, x, y, w, h, cornerR, fill, border));
  }

  const cx = r(x + w / 2);
  const nameFS = hasKids ? 14 : 12;
  const nameY = hasKids ? y + 24 : y + 28;
  out.push(`<text x="${cx}" y="${nameY}" text-anchor="middle" font-size="${nameFS}" font-weight="600" fill="${text}">${esc(box.el.name)}</text>`);

  if (box.el.technology) {
    out.push(`<text x="${cx}" y="${nameY + 16}" text-anchor="middle" font-size="9" fill="${border}" opacity="0.8">[${esc(box.el.technology)}]</text>`);
  }

  if (!hasKids && box.el.description) {
    const dy = box.el.technology ? nameY + 30 : nameY + 16;
    out.push(`<text x="${cx}" y="${dy}" text-anchor="middle" font-size="8.5" fill="${text}" opacity="0.5">${esc(truncate(box.el.description, 45))}</text>`);
  }

  for (const kid of box.kids) {
    drawBox(kid, x, y, out, isDark, palette);
  }
}

function svgShapeShadow(shape: C4Shape, x: number, y: number, w: number, h: number, rx: number, isDark: boolean): string {
  const shadowFill = isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.08)";
  if (shape === "database") {
    const ry = h * 0.12;
    return `<ellipse cx="${r(x + w / 2 + 2)}" cy="${r(y + ry + 2)}" rx="${r(w / 2)}" ry="${r(ry)}" fill="${shadowFill}"/>`;
  }
  if (shape === "cloud") return "";
  if (shape === "gateway") {
    return `<rect x="${x + 2}" y="${y + 2}" width="${w}" height="${h}" rx="${rx}" fill="${shadowFill}" />`;
  }
  return `<rect x="${x + 2}" y="${y + 2}" width="${w}" height="${h}" rx="${rx}" fill="${shadowFill}" />`;
}

function svgShape(shape: C4Shape, x: number, y: number, w: number, h: number, rx: number, fill: string, border: string): string {
  switch (shape) {
    case "database": {
      const ry = h * 0.12;
      return [
        `<path d="M${x},${r(y + ry)} L${x},${r(y + h - ry)}" stroke="${border}" stroke-width="1.5" fill="none"/>`,
        `<path d="M${x + w},${r(y + ry)} L${x + w},${r(y + h - ry)}" stroke="${border}" stroke-width="1.5" fill="none"/>`,
        `<ellipse cx="${r(x + w / 2)}" cy="${r(y + h - ry)}" rx="${r(w / 2)}" ry="${r(ry)}" fill="${fill}" stroke="${border}" stroke-width="1.5"/>`,
        `<rect x="${x}" y="${r(y + ry)}" width="${w}" height="${r(h - ry * 2)}" fill="${fill}"/>`,
        `<ellipse cx="${r(x + w / 2)}" cy="${r(y + ry)}" rx="${r(w / 2)}" ry="${r(ry)}" fill="${fill}" stroke="${border}" stroke-width="1.5"/>`,
      ].join("");
    }
    case "queue": {
      const qrx = w * 0.1;
      return `<rect x="${r(x + qrx)}" y="${y}" width="${r(w - qrx * 2)}" height="${h}" fill="${fill}"/>` +
        `<ellipse cx="${r(x + qrx)}" cy="${r(y + h / 2)}" rx="${r(qrx)}" ry="${r(h / 2)}" fill="${fill}" stroke="${border}" stroke-width="1.5"/>` +
        `<ellipse cx="${r(x + w - qrx)}" cy="${r(y + h / 2)}" rx="${r(qrx)}" ry="${r(h / 2)}" fill="${fill}" stroke="${border}" stroke-width="1.5"/>` +
        `<line x1="${r(x + qrx)}" y1="${y}" x2="${r(x + w - qrx)}" y2="${y}" stroke="${border}" stroke-width="1.5"/>` +
        `<line x1="${r(x + qrx)}" y1="${r(y + h)}" x2="${r(x + w - qrx)}" y2="${r(y + h)}" stroke="${border}" stroke-width="1.5"/>`;
    }
    case "gateway": {
      const cx = x + w / 2, cy = y + h / 2;
      const hrx = w / 2, hry = h / 2;
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        return `${r(cx + hrx * Math.cos(a))},${r(cy + hry * Math.sin(a))}`;
      }).join(" ");
      return `<polygon points="${pts}" fill="${fill}" stroke="${border}" stroke-width="1.5"/>`;
    }
    case "browser":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${border}" stroke-width="1.5"/>` +
        `<line x1="${x}" y1="${r(y + h * 0.18)}" x2="${r(x + w)}" y2="${r(y + h * 0.18)}" stroke="${border}" stroke-width="1" opacity="0.5"/>` +
        `<circle cx="${r(x + 8)}" cy="${r(y + h * 0.09)}" r="2" fill="${border}" opacity="0.3"/>` +
        `<circle cx="${r(x + 16)}" cy="${r(y + h * 0.09)}" r="2" fill="${border}" opacity="0.3"/>` +
        `<circle cx="${r(x + 24)}" cy="${r(y + h * 0.09)}" r="2" fill="${border}" opacity="0.3"/>`;
    case "mobile":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${border}" stroke-width="1.5"/>` +
        `<circle cx="${r(x + w / 2)}" cy="${r(y + h - 8)}" r="3" fill="none" stroke="${border}" stroke-width="1"/>`;
    case "cloud": {
      const ccx = x + w / 2, ccy = y + h * 0.55;
      return `<circle cx="${r(ccx)}" cy="${r(ccy)}" r="${r(h * 0.28)}" fill="${fill}" stroke="${border}" stroke-width="1.5"/>` +
        `<circle cx="${r(ccx - w * 0.22)}" cy="${r(ccy + h * 0.05)}" r="${r(h * 0.22)}" fill="${fill}" stroke="${border}" stroke-width="1"/>` +
        `<circle cx="${r(ccx + w * 0.22)}" cy="${r(ccy + h * 0.05)}" r="${r(h * 0.22)}" fill="${fill}" stroke="${border}" stroke-width="1"/>` +
        `<circle cx="${r(ccx - w * 0.1)}" cy="${r(ccy - h * 0.15)}" r="${r(h * 0.2)}" fill="${fill}" stroke="${border}" stroke-width="1"/>` +
        `<circle cx="${r(ccx + w * 0.12)}" cy="${r(ccy - h * 0.12)}" r="${r(h * 0.18)}" fill="${fill}" stroke="${border}" stroke-width="1"/>`;
    }
    case "firewall": {
      const scx = x + w / 2;
      return `<path d="M${r(scx)},${y} L${r(x + w)},${r(y + h * 0.2)} L${r(x + w)},${r(y + h * 0.55)} Q${r(x + w)},${r(y + h * 0.85)} ${r(scx)},${r(y + h)} Q${x},${r(y + h * 0.85)} ${x},${r(y + h * 0.55)} L${x},${r(y + h * 0.2)} Z" fill="${fill}" stroke="${border}" stroke-width="1.5"/>`;
    }
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${border}" stroke-width="1.5"/>`;
  }
}

function buildAncestorMap(elements: C4Element[]): Map<string, string> {
  const map = new Map<string, string>();
  function walk(el: C4Element, topId: string) {
    map.set(el.id, topId);
    if (el.children) {
      for (const child of el.children) walk(child, topId);
    }
  }
  for (const el of elements) walk(el, el.id);
  return map;
}

function lineIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  rx: number, ry: number, rw: number, rh: number
): boolean {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) return true;
  for (const t of [0.3, 0.4, 0.5, 0.6, 0.7]) {
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) return true;
  }
  return false;
}

function clipLineToBox(
  cx: number, cy: number, tx: number, ty: number,
  bx: number, by: number, bw: number, bh: number
): { x: number; y: number } {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  let t = 1;
  const pad = 4;
  if (dx > 0) { const tt = (bx + bw + pad - cx) / dx; if (tt > 0 && tt < t) t = tt; }
  if (dx < 0) { const tt = (bx - pad - cx) / dx; if (tt > 0 && tt < t) t = tt; }
  if (dy > 0) { const tt = (by + bh + pad - cy) / dy; if (tt > 0 && tt < t) t = tt; }
  if (dy < 0) { const tt = (by - pad - cy) / dy; if (tt > 0 && tt < t) t = tt; }
  return { x: cx + dx * t, y: cy + dy * t };
}

function routeRelationship(
  from: { cx: number; cy: number },
  to: { cx: number; cy: number },
  fromRect: { x: number; y: number; w: number; h: number },
  toRect: { x: number; y: number; w: number; h: number },
  allBoxes: { x: number; y: number; w: number; h: number }[],
  desc: string | undefined,
  palette: SvgThemePalette,
  out: string[]
): void {
  // Clip to box edges
  const f = clipLineToBox(from.cx, from.cy, to.cx, to.cy, fromRect.x, fromRect.y, fromRect.w, fromRect.h);
  const t = clipLineToBox(to.cx, to.cy, from.cx, from.cy, toRect.x, toRect.y, toRect.w, toRect.h);

  const fx = f.x, fy = f.y, tx = t.x, ty = t.y;
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  let blocked = false;
  for (const b of allBoxes) {
    if (lineIntersectsRect(fx, fy, tx, ty, b.x - 8, b.y - 8, b.w + 16, b.h + 16)) {
      blocked = true;
      break;
    }
  }

  if (!blocked) {
    out.push(`<line x1="${r(fx)}" y1="${r(fy)}" x2="${r(tx)}" y2="${r(ty)}" stroke="${palette.relColor}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
  } else {
    const mx = (fx + tx) / 2;
    const perpX = -dy / len;
    const perpY = dx / len;
    const offset = Math.min(len * 0.3, 80);
    const cpx = mx + perpX * offset;
    const cpy = (fy + ty) / 2 + perpY * offset - 30;
    out.push(`<path d="M${r(fx)},${r(fy)} Q${r(cpx)},${r(cpy)} ${r(tx)},${r(ty)}" fill="none" stroke="${palette.relColor}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
  }

  // Filled arrowhead at target
  const ux = dx / len;
  const uy = dy / len;
  const headLen = 10;
  out.push(`<polygon points="${r(tx)},${r(ty)} ${r(tx - ux * headLen - uy * 5)},${r(ty - uy * headLen + ux * 5)} ${r(tx - ux * headLen + uy * 5)},${r(ty - uy * headLen - ux * 5)}" fill="${palette.relColor}" opacity="0.8"/>`);

  if (desc) {
    const mx = (fx + tx) / 2;
    const my = (fy + ty) / 2 - 8;
    const textW = tw(desc, 9) + 14;
    out.push(`<rect x="${r(mx - textW / 2)}" y="${r(my - 11)}" width="${r(textW)}" height="16" rx="4" fill="${palette.bg}" opacity="0.92"/>`);
    out.push(`<text x="${r(mx)}" y="${r(my + 1)}" text-anchor="middle" font-size="9" fill="${palette.relLabelColor}">${esc(desc)}</text>`);
  }
}

// ── Public API ──

export interface RenderSvgOptions {
  /** Theme: "light" or "dark". Default: "dark" */
  theme?: "light" | "dark";
  /** If provided, render only the visible elements/relationships from this view state */
  viewState?: ViewState;
  /** If true, omit the background rectangle (useful for PDF export compositing) */
  transparent?: boolean;
}

/**
 * Render a C4Model to an SVG string.
 * Pure function — no DOM or browser dependencies.
 */
export function renderSvgString(model: C4Model, options: RenderSvgOptions = {}): string {
  const elements = options.viewState ? options.viewState.visibleElements : model.elements;
  if (elements.length === 0) return "";

  const theme = options.theme ?? "dark";
  const isDark = theme === "dark";
  const palette = getSvgPalette(theme);

  const persons = elements.filter((e) => e.type === "person");
  const others = elements.filter((e) => e.type !== "person");

  const personBoxes = persons.map((e) => sizeBox(e));
  const otherBoxes = others.map((e) => sizeBox(e));

  const COL_GAP = 80;
  const ROW_GAP = 100;

  const personRowW = personBoxes.reduce((s, b) => s + b.w, 0) + Math.max(0, personBoxes.length - 1) * COL_GAP;
  let px = -personRowW / 2;
  for (const box of personBoxes) {
    box.x = px;
    box.y = 0;
    px += box.w + COL_GAP;
  }

  const personRowH = personBoxes.length > 0 ? Math.max(...personBoxes.map((b) => b.h)) : 0;

  const sysCols = Math.max(Math.ceil(Math.sqrt(otherBoxes.length)), personBoxes.length || 1);
  const sysRows: Box[][] = [];
  for (let i = 0; i < otherBoxes.length; i += sysCols) {
    sysRows.push(otherBoxes.slice(i, i + sysCols));
  }

  let sy = personRowH > 0 ? personRowH + ROW_GAP : 0;
  for (const row of sysRows) {
    const rowW = row.reduce((s, b) => s + b.w, 0) + (row.length - 1) * COL_GAP;
    let sx = -rowW / 2;
    const rowH = Math.max(...row.map((b) => b.h));
    for (const box of row) {
      box.x = sx;
      box.y = sy + (rowH - box.h) / 2;
      sx += box.w + COL_GAP;
    }
    sy += rowH + ROW_GAP;
  }

  const allBoxes = [...personBoxes, ...otherBoxes];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of allBoxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  // Pre-expand bbox to account for relationship label text that may extend beyond element boxes
  const preOffX = -minX;
  const preOffY = -minY;
  // We need topCenters to estimate label positions, but they depend on offsets.
  // Do a preliminary pass: compute label midpoints using raw box positions + pre-offset,
  // then expand minX/maxX/minY/maxY accordingly.
  {
    const preCenters = new Map<string, { cx: number; cy: number }>();
    for (const b of allBoxes) {
      preCenters.set(b.el.id, { cx: b.x + b.w / 2, cy: b.y + b.h / 2 });
    }
    const preAncestorMap = buildAncestorMap(elements);
    const preDrawn = new Set<string>();
    const rels = options.viewState ? options.viewState.visibleRelationships : model.relationships;
    for (const rel of rels) {
      const fromTop = preAncestorMap.get(rel.sourceId);
      const toTop = preAncestorMap.get(rel.destinationId);
      if (!fromTop || !toTop || fromTop === toTop) continue;
      const key = `${fromTop}:${toTop}`;
      if (preDrawn.has(key)) continue;
      preDrawn.add(key);
      const from = preCenters.get(fromTop);
      const to = preCenters.get(toTop);
      if (!from || !to || !rel.description) continue;
      const mx = (from.cx + to.cx) / 2;
      const my = (from.cy + to.cy) / 2;
      const labelW = tw(rel.description, 9) + 14;
      minX = Math.min(minX, mx - labelW / 2 - 10);
      maxX = Math.max(maxX, mx + labelW / 2 + 10);
      minY = Math.min(minY, my - 15);
      maxY = Math.max(maxY, my + 15);
    }
  }
  const pad = 40;
  const svgW = Math.round(maxX - minX + pad * 2);
  const svgH = Math.round(maxY - minY + pad * 2) + 25;
  const offX = -minX + pad;
  const offY = -minY + pad;

  const topCenters = new Map<string, { cx: number; cy: number }>();
  const topBoxRects = new Map<string, { x: number; y: number; w: number; h: number }>();
  const topRects: { x: number; y: number; w: number; h: number }[] = [];
  for (const b of allBoxes) {
    const bx = b.x + offX;
    const by = b.y + offY;
    topCenters.set(b.el.id, { cx: bx + b.w / 2, cy: by + b.h / 2 });
    topBoxRects.set(b.el.id, { x: bx, y: by, w: b.w, h: b.h });
    topRects.push({ x: bx, y: by, w: b.w, h: b.h });
  }

  const ancestorMap = buildAncestorMap(elements);
  const drawnRels = new Set<string>();

  interface RelInfo {
    from: { cx: number; cy: number };
    to: { cx: number; cy: number };
    fromRect: { x: number; y: number; w: number; h: number };
    toRect: { x: number; y: number; w: number; h: number };
    desc?: string;
  }
  const topRels: RelInfo[] = [];

  const relationships = options.viewState ? options.viewState.visibleRelationships : model.relationships;
  for (const rel of relationships) {
    const fromTop = ancestorMap.get(rel.sourceId);
    const toTop = ancestorMap.get(rel.destinationId);
    if (!fromTop || !toTop || fromTop === toTop) continue;

    const key = `${fromTop}:${toTop}`;
    if (drawnRels.has(key)) continue;
    drawnRels.add(key);

    const from = topCenters.get(fromTop);
    const to = topCenters.get(toTop);
    const fromRect = topBoxRects.get(fromTop);
    const toRect = topBoxRects.get(toTop);
    if (!from || !to || !fromRect || !toRect) continue;

    topRels.push({ from, to, fromRect, toRect, desc: rel.description });
  }

  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`);
  if (!options.transparent) {
    out.push(`<rect width="100%" height="100%" fill="${palette.bg}"/>`);
  }
  out.push(`<style>text { font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif; }</style>`);

  if (isDark) {
    out.push(`<defs><filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`);
  }

  for (const { from, to, fromRect, toRect, desc } of topRels) {
    const crossBoxes = topRects.filter((b) => {
      const bcx = b.x + b.w / 2;
      const bcy = b.y + b.h / 2;
      const isFrom = Math.abs(bcx - from.cx) < 5 && Math.abs(bcy - from.cy) < 5;
      const isTo = Math.abs(bcx - to.cx) < 5 && Math.abs(bcy - to.cy) < 5;
      return !isFrom && !isTo;
    });
    routeRelationship(from, to, fromRect, toRect, crossBoxes, desc, palette, out);
  }

  for (const box of allBoxes) {
    drawBox(box, offX, offY, out, isDark, palette);
  }

  out.push(`<text x="${svgW / 2}" y="${svgH - 14}" text-anchor="middle" font-size="10" fill="${palette.relLabelColor}" opacity="0.35">${esc(model.name)} — exported from Spacerizr</text>`);
  out.push(`</svg>`);

  return out.join("\n");
}
