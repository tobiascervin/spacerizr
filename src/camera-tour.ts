/**
 * Camera fly-through — automated cinematic tour through presentation slides.
 * Navigates to each slide with pauses between transitions.
 */

import { Slide } from "./presentation";

let tourRunning = false;
let tourAbortController: AbortController | null = null;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Tour aborted"));
    });
  });
}

export async function startTour(
  slides: Slide[],
  navigateFn: (path: string[]) => void,
  showSlideFn: (index: number) => void,
  onComplete: () => void
): Promise<void> {
  if (tourRunning) return;
  tourRunning = true;
  tourAbortController = new AbortController();
  const signal = tourAbortController.signal;

  try {
    for (let i = 0; i < slides.length; i++) {
      if (signal.aborted) break;

      showSlideFn(i);

      // Wait for camera animation (1.5s) + viewing pause (3s)
      await wait(4500, signal);
    }
  } catch {
    // Aborted — that's fine
  }

  tourRunning = false;
  tourAbortController = null;
  onComplete();
}

export function stopTour(): void {
  if (tourAbortController) {
    tourAbortController.abort();
  }
}

export function isTourRunning(): boolean {
  return tourRunning;
}
