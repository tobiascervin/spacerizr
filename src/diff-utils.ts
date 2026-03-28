/**
 * Architecture diff — compare two C4 models and report differences.
 * Pure functions, no DOM dependencies.
 */

import { C4Element, C4Model, C4Relationship } from "./types";

export interface DiffResult {
  added: { elements: C4Element[]; relationships: C4Relationship[] };
  removed: { elements: C4Element[]; relationships: C4Relationship[] };
  modified: { elementId: string; name: string; changes: string[] }[];
}

function collectElements(elements: C4Element[]): Map<string, C4Element> {
  const map = new Map<string, C4Element>();
  function walk(els: C4Element[]) {
    for (const el of els) {
      map.set(el.id, el);
      if (el.children) walk(el.children);
    }
  }
  walk(elements);
  return map;
}

function relKey(r: C4Relationship): string {
  return `${r.sourceId}:${r.destinationId}`;
}

export function diffModels(oldModel: C4Model, newModel: C4Model): DiffResult {
  const oldEls = collectElements(oldModel.elements);
  const newEls = collectElements(newModel.elements);

  const addedElements: C4Element[] = [];
  const removedElements: C4Element[] = [];
  const modified: DiffResult["modified"] = [];

  // Find added and modified elements
  for (const [id, newEl] of newEls) {
    const oldEl = oldEls.get(id);
    if (!oldEl) {
      addedElements.push(newEl);
    } else {
      const changes: string[] = [];
      if (oldEl.name !== newEl.name) changes.push(`name: "${oldEl.name}" → "${newEl.name}"`);
      if (oldEl.description !== newEl.description) changes.push(`description changed`);
      if (oldEl.technology !== newEl.technology) changes.push(`technology: "${oldEl.technology ?? ""}" → "${newEl.technology ?? ""}"`);
      if (oldEl.type !== newEl.type) changes.push(`type: ${oldEl.type} → ${newEl.type}`);
      if (changes.length > 0) {
        modified.push({ elementId: id, name: newEl.name, changes });
      }
    }
  }

  // Find removed elements
  for (const [id, oldEl] of oldEls) {
    if (!newEls.has(id)) {
      removedElements.push(oldEl);
    }
  }

  // Relationship diff
  const oldRels = new Map(oldModel.relationships.map((r) => [relKey(r), r]));
  const newRels = new Map(newModel.relationships.map((r) => [relKey(r), r]));

  const addedRels: C4Relationship[] = [];
  const removedRels: C4Relationship[] = [];

  for (const [key, rel] of newRels) {
    if (!oldRels.has(key)) addedRels.push(rel);
  }
  for (const [key, rel] of oldRels) {
    if (!newRels.has(key)) removedRels.push(rel);
  }

  return {
    added: { elements: addedElements, relationships: addedRels },
    removed: { elements: removedElements, relationships: removedRels },
    modified,
  };
}

/** Format diff result as human-readable text with ANSI colors */
export function formatDiff(diff: DiffResult): string {
  const lines: string[] = [];
  const green = "\x1b[32m";
  const red = "\x1b[31m";
  const yellow = "\x1b[33m";
  const reset = "\x1b[0m";

  if (diff.added.elements.length > 0) {
    lines.push(`${green}Added elements:${reset}`);
    for (const el of diff.added.elements) {
      lines.push(`  ${green}+ ${el.name} (${el.type})${reset}`);
    }
  }

  if (diff.removed.elements.length > 0) {
    lines.push(`${red}Removed elements:${reset}`);
    for (const el of diff.removed.elements) {
      lines.push(`  ${red}- ${el.name} (${el.type})${reset}`);
    }
  }

  if (diff.modified.length > 0) {
    lines.push(`${yellow}Modified elements:${reset}`);
    for (const mod of diff.modified) {
      lines.push(`  ${yellow}~ ${mod.name}${reset}`);
      for (const change of mod.changes) {
        lines.push(`    ${change}`);
      }
    }
  }

  if (diff.added.relationships.length > 0) {
    lines.push(`${green}Added relationships:${reset}`);
    for (const rel of diff.added.relationships) {
      lines.push(`  ${green}+ ${rel.sourceId} → ${rel.destinationId}${rel.description ? ` (${rel.description})` : ""}${reset}`);
    }
  }

  if (diff.removed.relationships.length > 0) {
    lines.push(`${red}Removed relationships:${reset}`);
    for (const rel of diff.removed.relationships) {
      lines.push(`  ${red}- ${rel.sourceId} → ${rel.destinationId}${rel.description ? ` (${rel.description})` : ""}${reset}`);
    }
  }

  const total = diff.added.elements.length + diff.removed.elements.length + diff.modified.length +
    diff.added.relationships.length + diff.removed.relationships.length;

  if (total === 0) {
    lines.push("No differences found.");
  } else {
    lines.push(`\n${total} change(s) detected.`);
  }

  return lines.join("\n");
}
