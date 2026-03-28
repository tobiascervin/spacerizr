/**
 * HTML Deck Export — generates a self-contained presentation HTML file
 * with all slides as SVGs, arrow key navigation, and speaker notes.
 */

import { C4Model } from "./types";
import { renderSvgString } from "./svg-renderer";
import { getViewState } from "./navigation";
import { Slide } from "./presentation";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function exportHTMLDeck(slides: Slide[], model: C4Model, theme: "light" | "dark"): void {
  const isDark = theme === "dark";
  const bg = isDark ? "#0f0f1a" : "#fafafa";
  const fg = isDark ? "#e0e0e0" : "#333";
  const accent = "#6366f1";

  const slideSvgs = slides.map((slide) => {
    const viewState = slide.path.length > 0 ? getViewState(model, slide.path) : undefined;
    return renderSvgString(model, { theme, viewState }) || "";
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(model.name)} — Presentation</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: ${bg}; color: ${fg}; font-family: -apple-system, sans-serif; overflow: hidden; }
  .slide { display: none; width: 100vw; height: 100vh; align-items: center; justify-content: center; position: relative; }
  .slide.active { display: flex; }
  .slide svg { max-width: 90vw; max-height: 85vh; }
  .slide-annotation {
    position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%);
    background: ${isDark ? "rgba(30,30,50,0.85)" : "rgba(255,255,255,0.9)"};
    padding: 8px 24px; border-radius: 8px; font-size: 18px; font-weight: 600;
    color: ${accent}; backdrop-filter: blur(8px);
    border: 1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"};
  }
  .toolbar {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 8px; align-items: center;
    background: ${isDark ? "rgba(30,30,50,0.85)" : "rgba(255,255,255,0.9)"};
    padding: 6px 16px; border-radius: 8px; backdrop-filter: blur(8px);
    border: 1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"};
  }
  .toolbar button {
    background: none; border: none; color: ${fg}; cursor: pointer;
    font-size: 16px; padding: 4px 8px; border-radius: 4px;
  }
  .toolbar button:hover { background: ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"}; }
  .counter { font-size: 13px; opacity: 0.5; min-width: 50px; text-align: center; }
  .notes-panel {
    display: none; position: fixed; bottom: 0; left: 0; right: 0; height: 160px;
    background: ${isDark ? "rgba(15,15,30,0.95)" : "rgba(255,255,255,0.95)"};
    border-top: 1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"};
    padding: 16px 24px; font-size: 14px; line-height: 1.5;
    overflow-y: auto; backdrop-filter: blur(8px);
  }
  .notes-panel.visible { display: block; }
  .badge {
    position: fixed; top: 12px; right: 12px; font-size: 11px; opacity: 0.3;
  }
</style>
</head>
<body>
${slideSvgs.map((svg, i) => `
  <div class="slide" id="s${i}">
    ${svg}
    ${slides[i].annotation ? `<div class="slide-annotation">${escapeHtml(slides[i].annotation!)}</div>` : ""}
  </div>
`).join("")}
<div class="toolbar">
  <button onclick="prev()">&larr;</button>
  <span class="counter" id="ctr">1 / ${slides.length}</span>
  <button onclick="next()">&rarr;</button>
  <button onclick="toggleNotes()" title="Toggle notes (N)">N</button>
  <button onclick="goFullscreen()" title="Fullscreen (F)">F</button>
</div>
<div class="notes-panel" id="notes"></div>
<div class="badge">Exported from Spacerizr</div>
<script>
  var cur = 0, total = ${slides.length};
  var notes = ${JSON.stringify(slides.map((s) => s.notes ?? ""))};
  function show(i) {
    document.querySelectorAll('.slide').forEach(function(s){s.classList.remove('active')});
    document.getElementById('s'+i).classList.add('active');
    document.getElementById('ctr').textContent = (i+1)+' / '+total;
    var np = document.getElementById('notes');
    np.textContent = notes[i] || '(No notes)';
  }
  function next() { if(cur<total-1) show(++cur); }
  function prev() { if(cur>0) show(--cur); }
  function toggleNotes() { document.getElementById('notes').classList.toggle('visible'); }
  function goFullscreen() { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); }
  document.addEventListener('keydown', function(e) {
    if(e.key==='ArrowRight'||e.key===' ') next();
    if(e.key==='ArrowLeft') prev();
    if(e.key==='n'||e.key==='N') toggleNotes();
    if(e.key==='f'||e.key==='F') goFullscreen();
    if(e.key==='Home') show(cur=0);
    if(e.key==='End') show(cur=total-1);
  });
  show(0);
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${model.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-presentation.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
