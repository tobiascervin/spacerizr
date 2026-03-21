import { C4Model } from "./types";
import { settings } from "./settings";
import { renderSvgString } from "./svg-renderer";

// ── Helpers ──

function download(url: string, filename: string, isBlob = false): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (isBlob) URL.revokeObjectURL(url);
}

// ── PNG Export (2D view only) ──

export function exportPNG(): void {
  if (settings.viewMode !== "2d") {
    alert("PNG export is only available in 2D view. Switch to 2D first.");
    return;
  }
  const canvas = document.getElementById("canvas-2d") as HTMLCanvasElement | null;
  if (!canvas) {
    console.error("No 2D canvas found for export");
    return;
  }
  const dataUrl = canvas.toDataURL("image/png");
  download(dataUrl, "spacerizr.png");
}

// ── SVG Export (browser download) ──

export function exportSVG(model: C4Model): void {
  const svgString = renderSvgString(model, { theme: settings.theme });
  if (!svgString) return;

  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  download(url, "spacerizr.svg", true);
}
