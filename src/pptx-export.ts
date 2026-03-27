/**
 * PPTX Export — renders presentation slides as PowerPoint.
 * Each slide is captured as a PNG and embedded as a full-bleed image.
 */

import PptxGenJS from "pptxgenjs";
import { Slide } from "./presentation";

function getActiveCanvas(): HTMLCanvasElement | null {
  const canvas2d = document.getElementById("canvas-2d") as HTMLCanvasElement | null;
  if (canvas2d && canvas2d.style.display !== "none") return canvas2d;
  const container = document.getElementById("app");
  return container?.querySelector("canvas:not(#canvas-2d)") as HTMLCanvasElement | null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function exportPPTX(
  slides: Slide[],
  navigateFn: (path: string[]) => void
): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 16:9

  // Show progress toast
  const toast = document.createElement("div");
  toast.id = "pptx-progress";
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(99,102,241,0.95); color: #fff; padding: 10px 24px;
    border-radius: 8px; font-size: 13px; font-family: "Inter", sans-serif;
    z-index: 99999;
  `;
  document.body.appendChild(toast);

  for (let i = 0; i < slides.length; i++) {
    toast.textContent = `Exporting slide ${i + 1} / ${slides.length}...`;

    // Navigate to slide view
    navigateFn(slides[i].path);
    // Wait for render (camera animation + canvas draw)
    await wait(200);

    const canvas = getActiveCanvas();
    if (!canvas) continue;

    // Capture as data URI
    const dataUrl = canvas.toDataURL("image/png");

    const pptxSlide = pptx.addSlide();

    // Full-bleed background image
    pptxSlide.addImage({
      data: dataUrl,
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
    });

    // Title overlay (bottom left)
    if (slides[i].annotation) {
      pptxSlide.addText(slides[i].annotation!, {
        x: 0.4,
        y: 6.6,
        w: 8,
        h: 0.5,
        fontSize: 18,
        color: "FFFFFF",
        fontFace: "Inter",
        shadow: { type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.5 },
      });
    }

    // Speaker notes
    if (slides[i].notes) {
      pptxSlide.addNotes(slides[i].notes!);
    }
  }

  toast.textContent = "Generating PPTX...";
  await pptx.writeFile({ fileName: "spacerizr-presentation.pptx" });
  toast.remove();
}
