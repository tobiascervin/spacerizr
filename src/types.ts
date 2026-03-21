/** C4 element types */
export type C4ElementType =
  | "person"
  | "softwareSystem"
  | "container"
  | "component";

/** A single C4 element */
export interface C4Element {
  id: string;
  name: string;
  description?: string;
  type: C4ElementType;
  technology?: string;
  tags?: string[];
  children?: C4Element[];
  /** Color used for rendering (hex) */
  color?: string;
}

/** A relationship between two elements */
export interface C4Relationship {
  sourceId: string;
  destinationId: string;
  description?: string;
  technology?: string;
}

/** The full workspace model */
export interface C4Model {
  name: string;
  description?: string;
  elements: C4Element[];
  relationships: C4Relationship[];
}

/** Navigation state — which level we're viewing and which parent we drilled into */
export interface ViewState {
  /** Breadcrumb path of element IDs we've drilled into */
  path: string[];
  /** The elements currently visible */
  visibleElements: C4Element[];
  /** The relationships currently visible (between visible elements) */
  visibleRelationships: C4Relationship[];
}
