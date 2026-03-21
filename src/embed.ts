/**
 * Spacerizr Embed API
 *
 * Mount an interactive 3D/2D C4 architecture viewer in any DOM element.
 *
 * Usage:
 *   import { parseDSL, createViewer } from 'spacerizr'
 *
 *   const model = parseDSL(dslText)
 *   const viewer = createViewer(document.getElementById('arch'), model, {
 *     theme: 'dark',
 *     viewMode: '3d',
 *     showControls: true,
 *   })
 *
 *   // Later:
 *   viewer.setTheme('light')
 *   viewer.navigateTo(['system-id', 'container-id'])
 *   viewer.loadModel(newModel)
 *   viewer.destroy()
 */

import { C4Element, C4Model } from "./types";
import { getViewState, getElementName, hasChildren } from "./navigation";
import {
  createScene,
  renderView,
  startRenderLoop,
  show3D,
  hide3D,
  applyTheme,
  SceneContext,
} from "./scene";
import {
  create2DScene,
  render2DView,
  refresh2D,
  show2D,
  hide2D,
  is2DReady,
} from "./scene2d";
import { settings, notifySettingsChange } from "./settings";

export interface ViewerOptions {
  /** Theme: "light" or "dark". Default: system preference */
  theme?: "light" | "dark";
  /** View mode: "3d" or "2d". Default: "3d" */
  viewMode?: "3d" | "2d";
  /** Show the controls panel. Default: false */
  showControls?: boolean;
  /** Show relationship labels. Default: true */
  showRelationshipLabels?: boolean;
  /** Enable floating animation (3D). Default: true */
  floatingEnabled?: boolean;
  /** Enable particle effects (3D). Default: true */
  particlesEnabled?: boolean;
  /** Callback when user clicks an element */
  onElementClick?: (element: C4Element, path: string[]) => void;
  /** Callback when user hovers an element */
  onElementHover?: (element: C4Element | null) => void;
}

export interface SpacerizrViewer {
  /** Navigate to a specific path (array of element IDs) */
  navigateTo(path: string[]): void;
  /** Load a new model */
  loadModel(model: C4Model): void;
  /** Switch theme */
  setTheme(theme: "light" | "dark"): void;
  /** Switch view mode */
  setViewMode(mode: "3d" | "2d"): void;
  /** Get current navigation path */
  getPath(): string[];
  /** Get the current model */
  getModel(): C4Model;
  /** Destroy the viewer and clean up */
  destroy(): void;
}

export function createViewer(
  container: HTMLElement,
  model: C4Model,
  options: ViewerOptions = {}
): SpacerizrViewer {
  // Apply options to settings
  if (options.theme) settings.theme = options.theme;
  if (options.viewMode) settings.viewMode = options.viewMode;
  if (options.showRelationshipLabels !== undefined) {
    settings.showRelationshipLabels = options.showRelationshipLabels;
  }
  if (options.floatingEnabled !== undefined) {
    settings.floatingEnabled = options.floatingEnabled;
  }
  if (options.particlesEnabled !== undefined) {
    settings.particlesEnabled = options.particlesEnabled;
  }

  // Ensure container has required attributes
  container.dataset.view = settings.viewMode;
  container.dataset.theme = settings.theme;

  let currentModel = model;
  let currentPath: string[] = [];

  // Element interaction handlers
  const handleClick = (element: C4Element) => {
    if (options.onElementClick) {
      options.onElementClick(element, currentPath);
    }
    if (hasChildren(currentModel, element.id)) {
      viewer.navigateTo([...currentPath, element.id]);
    }
  };

  const handleHover = (element: C4Element | null, _event: MouseEvent) => {
    if (options.onElementHover) {
      options.onElementHover(element);
    }
  };

  // Create scenes
  const sceneCtx = createScene(container, handleClick, handleHover);
  startRenderLoop(sceneCtx);
  create2DScene(container, handleClick, handleHover);

  // Show initial view
  if (settings.viewMode === "3d") {
    show3D(sceneCtx);
    hide2D();
  } else {
    hide3D(sceneCtx);
    show2D();
  }

  function doNavigate(path: string[]): void {
    currentPath = path;
    const viewState = getViewState(currentModel, currentPath);
    renderView(sceneCtx, viewState);
    if (is2DReady()) render2DView(viewState);
  }

  // Initial render
  doNavigate([]);

  const viewer: SpacerizrViewer = {
    navigateTo(path: string[]): void {
      doNavigate(path);
    },

    loadModel(newModel: C4Model): void {
      currentModel = newModel;
      currentPath = [];
      doNavigate([]);
    },

    setTheme(theme: "light" | "dark"): void {
      settings.theme = theme;
      container.dataset.theme = theme;
      applyTheme(sceneCtx);
      const viewState = getViewState(currentModel, currentPath);
      renderView(sceneCtx, viewState);
      if (is2DReady()) render2DView(viewState);
    },

    setViewMode(mode: "3d" | "2d"): void {
      settings.viewMode = mode;
      container.dataset.view = mode;
      if (mode === "3d") {
        show3D(sceneCtx);
        hide2D();
      } else {
        hide3D(sceneCtx);
        show2D();
        const viewState = getViewState(currentModel, currentPath);
        render2DView(viewState);
      }
    },

    getPath(): string[] {
      return [...currentPath];
    },

    getModel(): C4Model {
      return currentModel;
    },

    destroy(): void {
      hide3D(sceneCtx);
      hide2D();
      // Remove canvases added by the scenes
      const canvases = container.querySelectorAll("canvas");
      canvases.forEach((c) => c.remove());
    },
  };

  return viewer;
}
