/**
 * PDF Export — generates multi-page PDF from C4 model.
 * Each hierarchy level gets its own page.
 */

import { jsPDF } from "jspdf";
import { C4Model } from "./types";
import { renderSvgString } from "./svg-renderer";
import { getViewState } from "./navigation";
import { settings } from "./settings";

interface PageInfo {
  path: string[];
  name: string;
}

function getAllPages(model: C4Model): PageInfo[] {
  const pages: PageInfo[] = [];
  pages.push({ path: [], name: model.name });

  for (const el of model.elements) {
    if (el.children && el.children.length > 0) {
      pages.push({ path: [el.id], name: el.name });
      for (const child of el.children) {
        if (child.children && child.children.length > 0) {
          pages.push({ path: [el.id, child.id], name: child.name });
        }
      }
    }
  }
  return pages;
}

function svgToImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export async function exportPDF(model: C4Model): Promise<void> {
  const pages = getAllPages(model);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = 297;
  const pageH = 210;

  // Show progress
  const toast = document.createElement("div");
  toast.id = "pdf-progress";
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(99,102,241,0.95); color: #fff; padding: 10px 24px;
    border-radius: 8px; font-size: 13px; font-family: "Inter", sans-serif;
    z-index: 99999;
  `;
  document.body.appendChild(toast);

  for (let i = 0; i < pages.length; i++) {
    toast.textContent = `Generating PDF page ${i + 1} / ${pages.length}...`;

    const page = pages[i];
    const viewState = page.path.length > 0 ? getViewState(model, page.path) : undefined;
    const svg = renderSvgString(model, { theme: settings.theme, viewState, transparent: true });
    if (!svg) continue;

    if (i > 0) doc.addPage();

    try {
      const img = await svgToImage(svg);
      const canvas = document.createElement("canvas");
      const scale = 3; // high-res
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = settings.theme === "dark" ? "#0f0f1a" : "#f8f8f8";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/png");
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const pageRatio = pageW / pageH;

      let drawW: number, drawH: number, drawX: number, drawY: number;
      if (imgRatio > pageRatio) {
        drawW = pageW - 20;
        drawH = drawW / imgRatio;
        drawX = 10;
        drawY = (pageH - drawH) / 2;
      } else {
        drawH = pageH - 20;
        drawW = drawH * imgRatio;
        drawX = (pageW - drawW) / 2;
        drawY = 10;
      }

      doc.addImage(dataUrl, "PNG", drawX, drawY, drawW, drawH);
    } catch (e) {
      console.error(`Failed to render page ${i}:`, e);
    }
  }

  toast.textContent = "Saving PDF...";
  doc.save("spacerizr.pdf");
  toast.remove();
}
