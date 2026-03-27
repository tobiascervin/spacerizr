/**
 * <spacerizr-viewer> Web Component
 *
 * Usage:
 *   <spacerizr-viewer src="/arch.dsl" theme="dark" view="2d" controls></spacerizr-viewer>
 */

import { createViewer, SpacerizrViewer } from "./embed";
import { parseStructurizrDSL as parseDSL } from "./dsl-parser";
import { parseStructurizrJSON as parseJSON } from "./structurizr-parser";

class SpacerizrViewerElement extends HTMLElement {
  static observedAttributes = ["src", "dsl", "theme", "view", "controls"];

  private viewer: SpacerizrViewer | null = null;
  private container: HTMLDivElement | null = null;

  connectedCallback() {
    // Create shadow DOM with container
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `:host { display: block; width: 100%; height: 100%; position: relative; overflow: hidden; }
      .viewer-container { width: 100%; height: 100%; position: relative; }`;
    shadow.appendChild(style);

    this.container = document.createElement("div");
    this.container.className = "viewer-container";
    shadow.appendChild(this.container);

    this.loadContent();
  }

  disconnectedCallback() {
    this.viewer?.destroy();
    this.viewer = null;
  }

  attributeChangedCallback(name: string, _oldVal: string, newVal: string) {
    if (!this.viewer) return;

    switch (name) {
      case "theme":
        if (newVal === "light" || newVal === "dark") this.viewer.setTheme(newVal);
        break;
      case "view":
        if (newVal === "2d" || newVal === "3d") this.viewer.setViewMode(newVal);
        break;
      case "src":
      case "dsl":
        this.loadContent();
        break;
    }
  }

  private async loadContent() {
    if (!this.container) return;

    // Destroy previous viewer
    this.viewer?.destroy();

    let text: string | null = null;
    let isDsl = true;

    // Try inline DSL attribute
    const dslAttr = this.getAttribute("dsl");
    if (dslAttr) {
      text = dslAttr;
      isDsl = true;
    }

    // Try src URL
    const src = this.getAttribute("src");
    if (src && !text) {
      try {
        const res = await fetch(src);
        if (res.ok) {
          text = await res.text();
          isDsl = src.endsWith(".dsl") || text.trimStart().startsWith("workspace");
        }
      } catch (e) {
        console.error("spacerizr-viewer: Failed to load src:", e);
        return;
      }
    }

    if (!text) return;

    try {
      const model = isDsl ? parseDSL(text) : parseJSON(text);
      this.viewer = createViewer(this.container, model, {
        theme: (this.getAttribute("theme") as "light" | "dark") || undefined,
        viewMode: (this.getAttribute("view") as "2d" | "3d") || undefined,
        showControls: this.hasAttribute("controls"),
      });
    } catch (e) {
      console.error("spacerizr-viewer: Failed to parse:", e);
    }
  }
}

if (!customElements.get("spacerizr-viewer")) {
  customElements.define("spacerizr-viewer", SpacerizrViewerElement);
}
