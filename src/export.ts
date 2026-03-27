import { C4Model, ViewState } from "./types";
import { settings } from "./settings";
import { renderSvgString } from "./svg-renderer";
import { getViewState } from "./navigation";

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

async function canvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!blob) return false;
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    return true;
  } catch {
    return false;
  }
}

function getActiveCanvas(): HTMLCanvasElement | null {
  if (settings.viewMode === "2d") {
    return document.getElementById("canvas-2d") as HTMLCanvasElement | null;
  }
  // 3D: grab the WebGL canvas
  const container = document.getElementById("app");
  return container?.querySelector("canvas:not(#canvas-2d)") as HTMLCanvasElement | null;
}

// ── PNG Export (both 2D and 3D) ──

export function exportPNG(): void {
  const canvas = getActiveCanvas();
  if (!canvas) {
    console.error("No canvas found for export");
    return;
  }
  const dataUrl = canvas.toDataURL("image/png");
  download(dataUrl, "spacerizr.png");
}

// ── SVG Export (browser download) — uses current view ──

export function exportSVG(model: C4Model, currentPath: string[] = []): void {
  const svgString = renderSvgString(model, {
    theme: settings.theme,
    viewState: currentPath.length > 0 ? getViewState(model, currentPath) : undefined,
  });
  if (!svgString) return;

  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  download(url, "spacerizr.svg", true);
}

// ── Clipboard copy ──

export async function copyPNG(): Promise<void> {
  const canvas = getActiveCanvas();
  if (!canvas) return;
  const ok = await canvasToClipboard(canvas);
  showCopyFeedback(ok ? "PNG copied!" : "Copy failed — try downloading instead");
}

export async function copySVG(model: C4Model, currentPath: string[] = []): Promise<void> {
  const svgString = renderSvgString(model, {
    theme: settings.theme,
    viewState: currentPath.length > 0 ? getViewState(model, currentPath) : undefined,
  });
  if (!svgString) return;
  try {
    await navigator.clipboard.writeText(svgString);
    showCopyFeedback("SVG copied!");
  } catch {
    showCopyFeedback("Copy failed");
  }
}

// ── ZIP Export (all levels) ──

export async function exportAllLevelsZIP(model: C4Model): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // Generate all paths (same logic as presentation slides)
  const paths: { path: string[]; name: string }[] = [];
  paths.push({ path: [], name: model.name });

  for (const el of model.elements) {
    if (el.children && el.children.length > 0) {
      paths.push({ path: [el.id], name: el.name });
      for (const child of el.children) {
        if (child.children && child.children.length > 0) {
          paths.push({ path: [el.id, child.id], name: child.name });
        }
      }
    }
  }

  for (const p of paths) {
    const viewState = getViewState(model, p.path);
    const svg = renderSvgString(model, {
      theme: settings.theme,
      viewState,
    });
    if (svg) {
      const safeName = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
      zip.file(`${safeName}.svg`, svg);
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  download(url, "spacerizr-all-levels.zip", true);
}

function showCopyFeedback(message: string): void {
  let toast = document.getElementById("copy-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "copy-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast!.classList.remove("visible"), 1800);
}
