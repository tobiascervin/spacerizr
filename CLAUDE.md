# Spacerizr — Claude Instructions

> See also [AGENTS.md](./AGENTS.md) for agent-specific rules shared across all AI assistants.

## Project Overview

**Spacerizr** is a Three.js-based interactive 3D/2D visualization tool for Structurizr DSL C4 architecture models. It renders C4 diagrams in both a 3D floating scene and a flat 2D canvas, with presentation mode, PDF/SVG/PNG export, and mobile support.

**Stack:** TypeScript · Vite · Three.js · Canvas 2D · jsPDF · Playwright

---

## Key Source Files

| File | Responsibility |
|------|---------------|
| `src/main.ts` | App entry, routing, breadcrumb, welcome screen |
| `src/scene.ts` | Three.js 3D scene, render loop, shapes |
| `src/scene2d.ts` | Canvas 2D rendering, touch events, hit testing |
| `src/svg-renderer.ts` | SVG export (used by PDF + PNG) |
| `src/pdf-export.ts` | PDF export via jsPDF |
| `src/presentation.ts` | Presentation mode, slide navigation, spotlight |
| `src/controls-panel.ts` | Settings panel, bottom sheet on mobile |
| `src/types.ts` | C4 types, `getElementShape()` shape detection |
| `src/layout.ts` | 3D grid layout algorithm |
| `src/settings.ts` | Persistent settings (theme, viewMode, etc.) |
| `index.html` | All CSS including responsive media queries |

---

## Architecture Shapes

Shape detection is done in `src/types.ts` via `getElementShape()` — matches regex against `technology + name + tags`. Supported shapes: `box` (default), `person`, `database`, `queue`, `gateway`, `browser`, `mobile`, `cloud`, `firewall`.

Each shape has:
- A 3D geometry in `src/scene.ts`
- A 2D canvas draw function in `src/scene2d.ts`
- An SVG render function in `src/svg-renderer.ts`
- A `TextConfig` entry in `getTextConfig()` in `src/scene2d.ts` with per-shape Y positions and maxWidth

When adding/modifying a shape, **update all four locations**.

---

## 3D Rendering Rules

- Always call `renderer.setPixelRatio()` **before** `renderer.setSize()` (DPR fix)
- Ground decals (shadow plane, drill-down ring) use `userData.isGroundDecal = true` and counter-act float offset in the render loop — they must stay at ground level while the element floats
- Do not add a manual shadow plane — `renderer.shadowMap` handles real shadows
- Floating animation uses `Math.sin(time * 0.8 * speed + offset) * 0.08 * speed` per element

---

## 2D Canvas Rules

- Touch events: `touchstart`/`touchmove`/`touchend` with `passive: false` and `e.preventDefault()`
- Canvas style must have `touch-action: none`
- Text positioning: use `getTextConfig(shape, x, y, w, h)` — never hardcode Y fractions without updating `getTextConfig`
- Description text wraps to max 2 lines using `ctx.measureText()` — no char-count truncation
- Always pass `maxWidth` as 3rd arg to `ctx.fillText()`

---

## Mobile / Responsive Rules

- CSS breakpoints: `≤640px` (mobile), `641–1024px` (tablet)
- Settings panel on mobile is a bottom sheet: `position: fixed; bottom: 0; z-index: 200`
- `#controls-panel` must have `z-index: 210` on mobile (above backdrop at 199)
- Welcome screen: `position: fixed; overflow-y: auto; overscroll-behavior: contain` — **not** `position: absolute` (body has `overflow: hidden`)
- Touch targets minimum 44×44px
- Mobile breadcrumb shows `‹ Back` button instead of full crumb chain

---

## Git Conventions

- **Author:** Tobias Cervin `<cervinproduction@gmail.com>` — never anyone else
- **No Co-Authored-By** lines — ever
- Commit messages: lowercase imperative, describe what and why, e.g. `Fix 3D ground decals (static shadow/ring), remove duplicate shadow plane`
- Never auto-commit — always wait for explicit user approval

---

## Workflow

1. Make code changes
2. `npm run build` — verify no TypeScript/build errors
3. Open preview (`preview_start`) and visually verify the change
4. Show screenshot to user
5. Wait for explicit "commit" approval before committing
6. Commit and push only when approved

---

## Commands

```bash
npm run dev        # Dev server (Vite HMR)
npm run build      # Production build
npm run preview    # Serve production build
```

Playwright is available as an MCP connector for automated browser testing.
