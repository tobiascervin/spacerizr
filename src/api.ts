/**
 * Spacerizr Public API
 *
 * Headless (Node.js / browser):
 *   import { parseDSL, parseJSON, renderSVG } from 'spacerizr'
 *
 * Embed (browser only):
 *   import { parseDSL, createViewer } from 'spacerizr'
 *   const viewer = createViewer(container, model, { theme: 'dark' })
 */

// Re-export types
export type { C4Model, C4Element, C4Relationship, C4ElementType, ViewState } from "./types";

// Re-export parsers (pure functions, no DOM needed)
export { parseStructurizrDSL as parseDSL } from "./dsl-parser";
export { parseStructurizrJSON as parseJSON } from "./structurizr-parser";

// Re-export headless SVG renderer
export { renderSvgString as renderSVG } from "./svg-renderer";
export type { RenderSvgOptions } from "./svg-renderer";

// Re-export navigation helpers
export { getViewState, getElementName, hasChildren } from "./navigation";
