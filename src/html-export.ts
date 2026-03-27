/**
 * Self-contained HTML export.
 * Generates a single HTML file with an embedded SVG diagram and pan/zoom controls.
 */

import { C4Model, ViewState } from "./types";
import { renderSvgString } from "./svg-renderer";
import { settings } from "./settings";
import { getViewState } from "./navigation";

export function exportHTML(model: C4Model, currentPath: string[] = []): void {
  const viewState = currentPath.length > 0 ? getViewState(model, currentPath) : undefined;
  const svg = renderSvgString(model, { theme: settings.theme, viewState });
  if (!svg) return;

  const isDark = settings.theme === "dark";
  const bg = isDark ? "#0f0f1a" : "#fafafa";
  const textColor = isDark ? "#e0e0e0" : "#333";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(model.name)} — Spacerizr</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: ${bg}; overflow: hidden; font-family: -apple-system, sans-serif; }
  #viewer { width: 100vw; height: 100vh; cursor: grab; overflow: hidden; }
  #viewer.panning { cursor: grabbing; }
  #svg-container { transform-origin: 0 0; }
  #title {
    position: fixed; top: 12px; left: 12px;
    background: ${isDark ? "rgba(30,30,50,0.8)" : "rgba(255,255,255,0.9)"};
    color: ${textColor}; padding: 6px 14px; border-radius: 6px;
    font-size: 13px; font-weight: 600; backdrop-filter: blur(8px);
    border: 1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"};
  }
  #controls {
    position: fixed; bottom: 12px; right: 12px; display: flex; gap: 4px;
  }
  #controls button {
    background: ${isDark ? "rgba(30,30,50,0.8)" : "rgba(255,255,255,0.9)"};
    color: ${textColor}; border: 1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"};
    padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;
    backdrop-filter: blur(8px);
  }
  #controls button:hover { opacity: 0.8; }
  #badge {
    position: fixed; bottom: 12px; left: 12px;
    color: ${textColor}; opacity: 0.3; font-size: 11px;
  }
</style>
</head>
<body>
<div id="viewer">
  <div id="svg-container">${svg}</div>
</div>
<div id="title">${escapeHtml(model.name)}</div>
<div id="controls">
  <button onclick="zoomIn()">+</button>
  <button onclick="zoomOut()">−</button>
  <button onclick="resetView()">Fit</button>
</div>
<div id="badge">Exported from Spacerizr</div>
<script>
  const viewer = document.getElementById('viewer');
  const container = document.getElementById('svg-container');
  let scale = 1, panX = 0, panY = 0, isPanning = false, lastX = 0, lastY = 0;

  function updateTransform() {
    container.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + scale + ')';
  }

  // Fit on load
  const svg = container.querySelector('svg');
  if (svg) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const sw = svg.getAttribute('width') || vw, sh = svg.getAttribute('height') || vh;
    scale = Math.min(vw / sw, vh / sh) * 0.9;
    panX = (vw - sw * scale) / 2;
    panY = (vh - sh * scale) / 2;
    updateTransform();
  }

  viewer.addEventListener('mousedown', function(e) { isPanning = true; lastX = e.clientX; lastY = e.clientY; viewer.classList.add('panning'); });
  window.addEventListener('mousemove', function(e) { if (!isPanning) return; panX += e.clientX - lastX; panY += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; updateTransform(); });
  window.addEventListener('mouseup', function() { isPanning = false; viewer.classList.remove('panning'); });
  viewer.addEventListener('wheel', function(e) { e.preventDefault(); var d = e.deltaY > 0 ? 0.9 : 1.1; var mx = e.clientX, my = e.clientY; panX = mx - (mx - panX) * d; panY = my - (my - panY) * d; scale *= d; updateTransform(); }, { passive: false });

  function zoomIn() { scale *= 1.2; updateTransform(); }
  function zoomOut() { scale *= 0.8; updateTransform(); }
  function resetView() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var sw = svg.getAttribute('width') || vw, sh = svg.getAttribute('height') || vh;
    scale = Math.min(vw / sw, vh / sh) * 0.9;
    panX = (vw - sw * scale) / 2; panY = (vh - sh * scale) / 2;
    updateTransform();
  }
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${model.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
