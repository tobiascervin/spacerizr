/**
 * Model validation — checks for common issues in C4 models.
 */

import { C4Element, C4Model } from "./types";

export interface Diagnostic {
  level: "error" | "warning";
  message: string;
  elementId?: string;
}

function collectAllIds(elements: C4Element[]): Set<string> {
  const ids = new Set<string>();
  function walk(els: C4Element[]) {
    for (const el of els) {
      ids.add(el.id);
      if (el.children) walk(el.children);
    }
  }
  walk(elements);
  return ids;
}

export function validateModel(model: C4Model): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const allIds = collectAllIds(model.elements);
  const seenIds = new Set<string>();

  // Check elements
  function walkElements(elements: C4Element[]) {
    for (const el of elements) {
      // Duplicate IDs
      if (seenIds.has(el.id)) {
        diagnostics.push({
          level: "error",
          message: `Duplicate element ID: "${el.id}" (${el.name})`,
          elementId: el.id,
        });
      }
      seenIds.add(el.id);

      // Missing name
      if (!el.name || el.name.trim() === "") {
        diagnostics.push({
          level: "warning",
          message: `Element "${el.id}" has no name`,
          elementId: el.id,
        });
      }

      if (el.children) walkElements(el.children);
    }
  }
  walkElements(model.elements);

  // Check relationships
  for (const rel of model.relationships) {
    if (!allIds.has(rel.sourceId)) {
      diagnostics.push({
        level: "error",
        message: `Relationship references unknown source: "${rel.sourceId}"${rel.description ? ` (${rel.description})` : ""}`,
      });
    }
    if (!allIds.has(rel.destinationId)) {
      diagnostics.push({
        level: "error",
        message: `Relationship references unknown destination: "${rel.destinationId}"${rel.description ? ` (${rel.description})` : ""}`,
      });
    }
    if (rel.sourceId === rel.destinationId) {
      diagnostics.push({
        level: "warning",
        message: `Self-referencing relationship on "${rel.sourceId}"${rel.description ? ` (${rel.description})` : ""}`,
      });
    }
  }

  // No elements
  if (model.elements.length === 0) {
    diagnostics.push({
      level: "error",
      message: "Model has no elements",
    });
  }

  return diagnostics;
}
