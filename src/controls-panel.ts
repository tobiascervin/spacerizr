import { settings, notifySettingsChange, getTheme } from "./settings";
import { enterPresentation, openSlideEditor } from "./presentation";

export type ExportHandler = (format: "png" | "svg" | "copy-png" | "copy-svg" | "zip" | "mermaid" | "plantuml" | "html" | "pdf") => void;

/** Create and mount the controls panel */
export function createControlsPanel(onExport?: ExportHandler): void {
  const panel = document.createElement("div");
  panel.id = "controls-panel";
  panel.innerHTML = `
    <div class="controls-header">
      <button id="shortcuts-btn" title="Keyboard shortcuts (?)" class="header-icon-btn">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3"/>
          <text x="8" y="11.5" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600" font-family="Inter, sans-serif">?</text>
        </svg>
      </button>
      <button id="controls-toggle" title="Settings">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6.5 1L7.2 3.1C7.6 3.2 8 3.4 8.3 3.6L10.3 2.7L11.8 4.2L10.9 6.2C11.1 6.5 11.3 6.9 11.4 7.3L13.5 8V10L11.4 10.7C11.3 11.1 11.1 11.5 10.9 11.8L11.8 13.8L10.3 15.3L8.3 14.4C8 14.6 7.6 14.8 7.2 14.9L6.5 17H4.5L3.8 14.9C3.4 14.8 3 14.6 2.7 14.4L0.7 15.3L-0.8 13.8L0.1 11.8C-0.1 11.5 -0.3 11.1 -0.4 10.7L-2.5 10V8L-0.4 7.3C-0.3 6.9 -0.1 6.5 0.1 6.2L-0.8 4.2L0.7 2.7L2.7 3.6C3 3.4 3.4 3.2 3.8 3.1L4.5 1H6.5Z" transform="translate(2.5, -1) scale(0.85)" stroke="currentColor" stroke-width="1.2" fill="none"/>
          <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2" fill="none"/>
        </svg>
      </button>
    </div>
    <div class="controls-body" id="controls-body">
      <div class="control-section">
        <div class="section-title">View</div>
        <div class="control-row">
          <div class="toggle-group" id="view-mode-toggle">
            <button class="toggle-btn active" data-value="3d">3D</button>
            <button class="toggle-btn" data-value="2d">2D</button>
          </div>
        </div>
      </div>

      <div class="control-section">
        <div class="section-title">Theme</div>
        <div class="control-row">
          <div class="toggle-group" id="theme-toggle">
            <button class="toggle-btn ${settings.theme === "light" ? "active" : ""}" data-value="light">Light</button>
            <button class="toggle-btn ${settings.theme === "dark" ? "active" : ""}" data-value="dark">Dark</button>
          </div>
        </div>
      </div>

      <div class="control-section">
        <div class="section-title">Animation</div>
        <div class="control-row">
          <label class="control-label">
            <input type="checkbox" id="toggle-particles" checked />
            <span>Flow particles</span>
          </label>
        </div>
        <div class="control-row">
          <span class="control-text">Speed</span>
          <input type="range" id="particle-speed" min="0" max="200" value="100" class="slider" />
        </div>
        <div class="control-row">
          <label class="control-label">
            <input type="checkbox" id="toggle-floating" checked />
            <span>Floating motion</span>
          </label>
        </div>
        <div class="control-row">
          <span class="control-text">Intensity</span>
          <input type="range" id="float-speed" min="0" max="200" value="100" class="slider" />
        </div>
      </div>

      <div class="control-section">
        <div class="section-title">Labels</div>
        <div class="control-row">
          <label class="control-label">
            <input type="checkbox" id="toggle-rel-labels" checked />
            <span>Relationship labels</span>
          </label>
        </div>
      </div>

      <div class="control-section">
        <div class="section-title">Export</div>
        <div class="control-row export-row">
          <button class="export-btn" id="export-png" title="Export as PNG">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 11l4-5 3 3.5 2-2 3 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.3"/></svg>
            <span>PNG</span>
          </button>
          <button class="export-btn" id="export-svg" title="Export as SVG">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 12V4h2l2 4 2-4h2v8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.3"/></svg>
            <span>SVG</span>
          </button>
        </div>
        <div class="control-row export-row" style="margin-top:4px">
          <button class="export-btn export-btn-secondary" id="copy-png" title="Copy PNG to clipboard">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" stroke-width="1.3"/></svg>
            <span>Copy PNG</span>
          </button>
          <button class="export-btn export-btn-secondary" id="copy-svg" title="Copy SVG to clipboard">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" stroke="currentColor" stroke-width="1.3"/></svg>
            <span>Copy SVG</span>
          </button>
        </div>
        <div class="control-row export-row" style="margin-top:4px">
          <button class="export-btn export-btn-secondary" id="export-mermaid" title="Copy Mermaid C4 to clipboard">
            <span>Mermaid</span>
          </button>
          <button class="export-btn export-btn-secondary" id="export-plantuml" title="Copy PlantUML C4 to clipboard">
            <span>PlantUML</span>
          </button>
        </div>
        <div class="control-row export-row" style="margin-top:4px">
          <button class="export-btn export-btn-secondary" id="export-html" title="Export as self-contained HTML">
            <span>HTML</span>
          </button>
          <button class="export-btn export-btn-secondary" id="export-pdf" title="Export as multi-page PDF">
            <span>PDF</span>
          </button>
        </div>
        <div class="control-row" style="margin-top:4px">
          <button class="export-btn export-btn-secondary" id="export-zip" title="Export all levels as ZIP" style="width:100%">
            <span>All Levels (ZIP)</span>
          </button>
        </div>
      </div>

      <div class="control-section">
        <div class="section-title">Legend</div>
        <div id="legend-panel" class="legend-panel">
          <div class="legend-item"><span class="legend-swatch" data-type="person"></span><span>Person</span></div>
          <div class="legend-item"><span class="legend-swatch" data-type="softwareSystem"></span><span>Software System</span></div>
          <div class="legend-item"><span class="legend-swatch" data-type="container"></span><span>Container</span></div>
          <div class="legend-item"><span class="legend-swatch" data-type="component"></span><span>Component</span></div>
          <div class="legend-item"><span class="legend-swatch" data-type="external"></span><span>External</span></div>
        </div>
      </div>

      <div class="control-section">
        <div class="section-title">Present</div>
        <div class="control-row export-row">
          <button class="export-btn" id="present-btn" title="Enter presentation mode (P)">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M6 6l5 3-5 3V6z" fill="currentColor"/></svg>
            <span>Present</span>
          </button>
          <button class="export-btn" id="edit-slides-btn" title="Edit presentation slides">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.3"/><line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" stroke-width="1.3"/><line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" stroke-width="1.3"/><line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" stroke-width="1.3"/></svg>
            <span>Edit</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("app")!.appendChild(panel);

  // Toggle panel open/close — open by default
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  let isOpen = !isMobile; // Start closed on mobile
  const body = document.getElementById("controls-body")!;
  const toggleBtn = document.getElementById("controls-toggle")!;
  if (isOpen) {
    body.classList.add("open");
    toggleBtn.classList.add("active");
  }

  // Backdrop for mobile bottom sheet
  let backdrop: HTMLElement | null = null;
  function toggleBackdrop(show: boolean): void {
    if (!window.matchMedia("(max-width: 640px)").matches) {
      backdrop?.remove();
      backdrop = null;
      return;
    }
    if (show && !backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "controls-backdrop";
      backdrop.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:199;";
      document.body.appendChild(backdrop);
      backdrop.addEventListener("click", () => {
        isOpen = false;
        body.classList.remove("open");
        toggleBtn.classList.remove("active");
        toggleBackdrop(false);
      });
    } else if (!show && backdrop) {
      backdrop.remove();
      backdrop = null;
    }
  }

  toggleBtn.addEventListener("click", () => {
    isOpen = !isOpen;
    body.classList.toggle("open", isOpen);
    toggleBtn.classList.toggle("active", isOpen);
    toggleBackdrop(isOpen);
  });

  // View mode toggle
  const viewToggle = document.getElementById("view-mode-toggle")!;
  viewToggle.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      viewToggle.querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      settings.viewMode = (btn as HTMLElement).dataset.value as "3d" | "2d";
      notifySettingsChange();
    });
  });

  // Theme toggle
  const themeToggle = document.getElementById("theme-toggle")!;
  themeToggle.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      themeToggle.querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      settings.theme = (btn as HTMLElement).dataset.value as "light" | "dark";
      notifySettingsChange();
    });
  });

  // Particles
  bindCheckbox("toggle-particles", (v) => { settings.particlesEnabled = v; });
  bindSlider("particle-speed", (v) => { settings.particleSpeed = v / 100; });

  // Floating
  bindCheckbox("toggle-floating", (v) => { settings.floatingEnabled = v; });
  bindSlider("float-speed", (v) => { settings.floatSpeed = v / 100; });

  // Relationship labels
  bindCheckbox("toggle-rel-labels", (v) => { settings.showRelationshipLabels = v; });

  // Export buttons
  document.getElementById("export-png")!.addEventListener("click", () => onExport?.("png"));
  document.getElementById("export-svg")!.addEventListener("click", () => onExport?.("svg"));
  document.getElementById("copy-png")!.addEventListener("click", () => onExport?.("copy-png"));
  document.getElementById("copy-svg")!.addEventListener("click", () => onExport?.("copy-svg"));
  document.getElementById("export-zip")!.addEventListener("click", () => onExport?.("zip"));
  document.getElementById("export-pdf")!.addEventListener("click", () => onExport?.("pdf"));
  document.getElementById("export-mermaid")!.addEventListener("click", () => onExport?.("mermaid"));
  document.getElementById("export-plantuml")!.addEventListener("click", () => onExport?.("plantuml"));
  document.getElementById("export-html")!.addEventListener("click", () => onExport?.("html"));

  // Present buttons
  document.getElementById("present-btn")!.addEventListener("click", () => enterPresentation());
  document.getElementById("edit-slides-btn")!.addEventListener("click", () => openSlideEditor());

  // Legend swatches — apply theme colors
  updateLegendColors();
}

export function updateLegendColors(): void {
  const theme = getTheme();
  document.querySelectorAll(".legend-swatch").forEach((el) => {
    const type = (el as HTMLElement).dataset.type!;
    const palette = theme.element[type];
    if (palette) {
      // Use border color as background for better visibility in light mode
      (el as HTMLElement).style.backgroundColor = palette.border;
      (el as HTMLElement).style.borderColor = palette.border;
    }
  });
}

function bindCheckbox(id: string, onChange: (val: boolean) => void): void {
  const el = document.getElementById(id) as HTMLInputElement;
  el.addEventListener("change", () => {
    onChange(el.checked);
    notifySettingsChange();
  });
}

function bindSlider(id: string, onChange: (val: number) => void): void {
  const el = document.getElementById(id) as HTMLInputElement;
  el.addEventListener("input", () => {
    onChange(parseFloat(el.value));
    // No notifySettingsChange needed — render loop reads settings directly
  });
}
