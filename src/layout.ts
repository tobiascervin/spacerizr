import * as THREE from "three";
import { C4Element, C4Relationship } from "./types";

/** Base spacing between element centres */
const BASE_SPACING_X = 6;
const BASE_SPACING_Z = 5;

export interface LayoutNode {
  element: C4Element;
  position: THREE.Vector3;
}

/** Layout elements in rows, grouping persons separately from other types */
export function gridLayout(elements: C4Element[], relationships: C4Relationship[] = []): LayoutNode[] {
  if (elements.length === 0) return [];

  // Separate persons from other elements
  const persons = elements.filter((e) => e.type === "person");
  const others = elements.filter((e) => e.type !== "person");

  // Widen spacing if elements have long names
  const maxNameLen = Math.max(...elements.map((e) => e.name.length));
  const extraX = maxNameLen > 14 ? (maxNameLen - 14) * 0.15 : 0;

  // Also widen spacing based on longest relationship label
  const maxRelLen = relationships.length > 0
    ? Math.max(...relationships.map((r) => (r.description ?? "").length))
    : 0;
  const extraRelX = maxRelLen > 10 ? Math.min((maxRelLen - 10) * 0.06, 2.5) : 0;

  const spacingX = BASE_SPACING_X + extraX + extraRelX;
  const spacingZ = BASE_SPACING_Z + (maxRelLen > 20 ? 0.5 : 0);

  const result: LayoutNode[] = [];

  // Build rows: persons on top, then other elements in grid rows
  const rows: C4Element[][] = [];
  if (persons.length > 0) rows.push(persons);

  if (others.length > 0) {
    const cols = Math.max(Math.ceil(Math.sqrt(others.length)), persons.length);
    for (let i = 0; i < others.length; i += cols) {
      rows.push(others.slice(i, i + cols));
    }
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const z = (r - (rows.length - 1) / 2) * spacingZ;
    for (let c = 0; c < row.length; c++) {
      const x = (c - (row.length - 1) / 2) * spacingX;
      result.push({
        element: row[c],
        position: new THREE.Vector3(x, 0, z),
      });
    }
  }

  return result;
}
