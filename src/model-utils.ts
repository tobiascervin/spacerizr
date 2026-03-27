/**
 * Model utility functions for programmatic manipulation of C4 models.
 * All functions are pure — no DOM, no side effects.
 */

import { C4Element, C4Model, C4Relationship } from "./types";

/**
 * Filter elements recursively based on a predicate.
 * Preserves relationships between remaining elements.
 */
export function filterModel(
  model: C4Model,
  predicate: (el: C4Element) => boolean
): C4Model {
  function filterElements(elements: C4Element[]): C4Element[] {
    const result: C4Element[] = [];
    for (const el of elements) {
      if (predicate(el)) {
        const filtered = { ...el };
        if (filtered.children) {
          filtered.children = filterElements(filtered.children);
        }
        result.push(filtered);
      }
    }
    return result;
  }

  const elements = filterElements(model.elements);
  const allIds = collectAllIds(elements);
  const relationships = model.relationships.filter(
    (r) => allIds.has(r.sourceId) && allIds.has(r.destinationId)
  );

  return { ...model, elements, relationships };
}

/**
 * Merge multiple models into one.
 * Deduplicates elements by ID. Collects all relationships.
 */
export function mergeModels(...models: C4Model[]): C4Model {
  const elementMap = new Map<string, C4Element>();
  const relationships: C4Relationship[] = [];
  const relKeys = new Set<string>();

  for (const model of models) {
    for (const el of flattenElementTree(model.elements)) {
      if (!elementMap.has(el.id)) {
        elementMap.set(el.id, el);
      }
    }
    for (const rel of model.relationships) {
      const key = `${rel.sourceId}:${rel.destinationId}:${rel.description ?? ""}`;
      if (!relKeys.has(key)) {
        relKeys.add(key);
        relationships.push(rel);
      }
    }
  }

  // Rebuild top-level elements (those not appearing as children)
  const childIds = new Set<string>();
  for (const el of elementMap.values()) {
    if (el.children) {
      for (const child of el.children) childIds.add(child.id);
    }
  }

  const elements = Array.from(elementMap.values()).filter((el) => !childIds.has(el.id));

  return {
    name: models.map((m) => m.name).join(" + "),
    elements,
    relationships,
  };
}

/**
 * Flatten the hierarchy to a maximum depth.
 * depth=0: only top-level elements (no children)
 * depth=1: top-level + their direct children
 */
export function flattenModel(model: C4Model, depth = 0): C4Model {
  function flatten(elements: C4Element[], currentDepth: number): C4Element[] {
    return elements.map((el) => {
      const flat = { ...el };
      if (currentDepth >= depth) {
        delete flat.children;
      } else if (flat.children) {
        flat.children = flatten(flat.children, currentDepth + 1);
      }
      return flat;
    });
  }

  return { ...model, elements: flatten(model.elements, 0) };
}

/**
 * Get all element IDs that the given element transitively depends on.
 * Follows outgoing relationships recursively.
 */
export function getTransitiveDependencies(
  model: C4Model,
  elementId: string
): string[] {
  const visited = new Set<string>();
  const queue = [elementId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const rel of model.relationships) {
      if (rel.sourceId === current && !visited.has(rel.destinationId)) {
        visited.add(rel.destinationId);
        queue.push(rel.destinationId);
      }
    }
  }

  return Array.from(visited);
}

// ── Internal helpers ──

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

function flattenElementTree(elements: C4Element[]): C4Element[] {
  const result: C4Element[] = [];
  function walk(els: C4Element[]) {
    for (const el of els) {
      result.push(el);
      if (el.children) walk(el.children);
    }
  }
  walk(elements);
  return result;
}
