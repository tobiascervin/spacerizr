# Spacerizr

Interactive 3D/2D C4 architecture visualizer for [Structurizr](https://structurizr.com/) DSL and workspace JSON files.

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- **3D visualization** — Three.js-powered interactive scene with orbit controls, particle effects, and floating animations
- **2D visualization** — Clean, sketch-style canvas view with pan & zoom
- **Drill-down navigation** — Click elements to explore System > Container > Component levels
- **SVG & PNG export** — High-quality architecture diagrams for documentation
- **Dark & light themes** — Auto-detects system preference
- **Structurizr DSL & JSON** — Supports both workspace formats
- **Watch mode** — Auto-reloads when files change during development

## Quick Start

### CLI (recommended)

```bash
npx spacerizr                              # Scan current directory
npx spacerizr workspace.dsl                # Open a specific file
npx spacerizr docs/                        # Scan a directory
```

This starts a local viewer at `http://localhost:4777` and opens your browser.

### Install in a project

```bash
npm install spacerizr --save-dev
```

Add scripts to your `package.json`:

```json
{
  "scripts": {
    "arch": "spacerizr docs/",
    "arch:export": "spacerizr docs/ --export svg",
    "arch:watch": "spacerizr docs/ --watch"
  }
}
```

## CLI Reference

```
spacerizr [file-or-dir] [options]

Arguments:
  file-or-dir    Path to a .dsl or .json workspace file, or a directory
                 containing them. Defaults to current directory.

Options:
  --port, -p     Port to serve on (default: 4777)
  --export, -e   Export format: svg (headless export, then exit)
  --output, -o   Output file path for export (default: <filename>.svg)
  --theme, -t    Theme for export: dark or light (default: dark)
  --watch, -w    Watch for file changes and auto-reload browser
  --help, -h     Show this help message
```

### Examples

```bash
# Interactive viewer
spacerizr workspace.dsl
spacerizr docs/ --port 3000
spacerizr docs/ --watch

# Headless SVG export (no browser needed)
spacerizr workspace.dsl --export svg
spacerizr workspace.dsl --export svg --output architecture.svg
spacerizr workspace.dsl --export svg --theme light
spacerizr docs/ --export svg                  # Exports all files
```

## Programmatic API

Spacerizr exposes a pure JavaScript API for parsing and rendering — no browser required. Perfect for CI/CD pipelines, scripts, and custom tooling.

```bash
npm install spacerizr
```

### Parse & render SVG

```js
import { parseDSL, parseJSON, renderSVG } from "spacerizr";
import { readFileSync, writeFileSync } from "fs";

// Parse a DSL file
const dsl = readFileSync("workspace.dsl", "utf-8");
const model = parseDSL(dsl);

// Or parse a JSON workspace
const json = readFileSync("workspace.json", "utf-8");
const model2 = parseJSON(json);

// Render to SVG string (no DOM needed)
const svg = renderSVG(model, { theme: "dark" });
writeFileSync("architecture.svg", svg);
```

### Inspect the model

```js
import { parseDSL, getViewState, hasChildren } from "spacerizr";

const model = parseDSL(dslText);

// Get top-level view
const view = getViewState(model, []);
console.log("Elements:", view.visibleElements.map((e) => e.name));
console.log("Relationships:", view.visibleRelationships.length);

// Drill into a system
const systemId = model.elements.find((e) => e.type === "softwareSystem")?.id;
if (systemId && hasChildren(model, systemId)) {
  const drillDown = getViewState(model, [systemId]);
  console.log("Containers:", drillDown.visibleElements.map((e) => e.name));
}
```

### CI/CD example (GitHub Actions)

```yaml
name: Export architecture diagrams
on:
  push:
    paths: ["docs/**/*.dsl"]

jobs:
  export:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npx spacerizr docs/ --export svg --theme light
      - uses: actions/upload-artifact@v4
        with:
          name: architecture-diagrams
          path: "*.svg"
```

## Embed in Your App

Mount an interactive 3D/2D viewer inside any web application — Storybook, Docusaurus, internal portals, or your own React/Vue/Svelte app.

```bash
npm install spacerizr three
```

```js
import { parseDSL } from "spacerizr";
import { createViewer } from "spacerizr/embed";

const model = parseDSL(dslText);

const viewer = createViewer(document.getElementById("arch-container"), model, {
  theme: "dark",       // "light" | "dark"
  viewMode: "3d",      // "3d" | "2d"
  onElementClick: (element, path) => {
    console.log("Clicked:", element.name);
  },
});
```

### Viewer API

```js
// Navigate programmatically
viewer.navigateTo(["system-id", "container-id"]);

// Switch theme or view mode
viewer.setTheme("light");
viewer.setViewMode("2d");

// Load a different model
viewer.loadModel(anotherModel);

// Get current state
const path = viewer.getPath();
const model = viewer.getModel();

// Clean up
viewer.destroy();
```

### Viewer options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `theme` | `"light" \| "dark"` | system | Color theme |
| `viewMode` | `"3d" \| "2d"` | `"3d"` | Initial view mode |
| `showRelationshipLabels` | `boolean` | `true` | Show labels on relationship lines |
| `floatingEnabled` | `boolean` | `true` | Enable floating animation (3D) |
| `particlesEnabled` | `boolean` | `true` | Enable particle effects (3D) |
| `onElementClick` | `function` | — | Callback when an element is clicked |
| `onElementHover` | `function` | — | Callback when an element is hovered |

## Standalone Deployment

Build and deploy as a static site where users can drop `.dsl` or `.json` files:

```bash
npm run build
# Deploy the `dist/` folder to any static host
```

The standalone viewer shows a welcome screen with a drag-and-drop zone for loading workspace files.

## Types

All types are exported for TypeScript users:

```ts
import type {
  C4Model,
  C4Element,
  C4Relationship,
  C4ElementType,   // "person" | "softwareSystem" | "container" | "component"
  ViewState,
  RenderSvgOptions,
} from "spacerizr";
```

## Development

```bash
git clone https://github.com/your-username/spacerizr.git
cd spacerizr
npm install
npm run dev          # Start dev server at localhost:5173
npm run build        # Build static app → dist/
npm run build:lib    # Build library API → dist-lib/
npm run build:all    # Build both
```

## License

MIT
