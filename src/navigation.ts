import { C4Element, C4Model, C4Relationship, ViewState } from "./types";

/** Find an element by ID anywhere in the tree */
function findElement(elements: C4Element[], id: string): C4Element | undefined {
  for (const el of elements) {
    if (el.id === id) return el;
    if (el.children) {
      const found = findElement(el.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Get all element IDs in a subtree (element + all descendants) */
function getAllIds(element: C4Element): Set<string> {
  const ids = new Set<string>([element.id]);
  if (element.children) {
    for (const child of element.children) {
      for (const id of getAllIds(child)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

/** Get visible elements and relationships for a given navigation path */
export function getViewState(model: C4Model, path: string[]): ViewState {
  let visibleElements: C4Element[];

  if (path.length === 0) {
    // Top level: show all root elements
    visibleElements = model.elements;
  } else {
    // We've drilled into an element — show its children
    const targetId = path[path.length - 1];
    const target = findElement(model.elements, targetId);
    if (target?.children && target.children.length > 0) {
      visibleElements = target.children;
    } else {
      // No children, stay at current view
      visibleElements = model.elements;
    }
  }

  // Collect all IDs that are visible (including IDs that are descendants of visible elements)
  const visibleIds = new Set<string>();
  const directIds = new Set<string>();
  for (const el of visibleElements) {
    directIds.add(el.id);
    for (const id of getAllIds(el)) {
      visibleIds.add(id);
    }
  }

  // Also include IDs of elements *outside* the current scope that have
  // relationships to visible elements — we show them as "external" references
  // For now, filter relationships to only those between directly visible elements
  const visibleRelationships = model.relationships.filter(
    (r) => directIds.has(r.sourceId) && directIds.has(r.destinationId)
  );

  return { path, visibleElements, visibleRelationships };
}

/** Get the element name for a given ID */
export function getElementName(
  model: C4Model,
  id: string
): string | undefined {
  return findElement(model.elements, id)?.name;
}

/** Check if an element has children (can be drilled into) */
export function hasChildren(model: C4Model, id: string): boolean {
  const el = findElement(model.elements, id);
  return !!el?.children && el.children.length > 0;
}
