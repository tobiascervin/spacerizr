import { C4Element, C4ElementType, C4Model, C4Relationship } from "./types";

/**
 * Structurizr workspace JSON types (subset relevant for parsing)
 */

interface StructurizrRelationship {
  id: string;
  sourceId: string;
  destinationId: string;
  description?: string;
  technology?: string;
  tags?: string;
}

interface StructurizrComponent {
  id: string;
  name: string;
  description?: string;
  technology?: string;
  tags?: string;
  group?: string;
  relationships?: StructurizrRelationship[];
}

interface StructurizrContainer {
  id: string;
  name: string;
  description?: string;
  technology?: string;
  tags?: string;
  group?: string;
  components?: StructurizrComponent[];
  relationships?: StructurizrRelationship[];
}

interface StructurizrSoftwareSystem {
  id: string;
  name: string;
  description?: string;
  location?: string;
  tags?: string;
  group?: string;
  containers?: StructurizrContainer[];
  relationships?: StructurizrRelationship[];
}

interface StructurizrPerson {
  id: string;
  name: string;
  description?: string;
  location?: string;
  tags?: string;
  group?: string;
  relationships?: StructurizrRelationship[];
}

interface StructurizrModel {
  people?: StructurizrPerson[];
  softwareSystems?: StructurizrSoftwareSystem[];
}

interface StructurizrWorkspace {
  id?: number;
  name: string;
  description?: string;
  model: StructurizrModel;
}

// ── Color palette based on C4 conventions ──

const TYPE_COLORS: Record<C4ElementType, string> = {
  person: "#08427b",
  softwareSystem: "#1168bd",
  container: "#438dd5",
  component: "#85bbf0",
};

const EXTERNAL_COLOR = "#999999";

function isExternal(tags?: string, location?: string): boolean {
  if (location === "External") return true;
  if (tags?.includes("External")) return true;
  return false;
}

function parseTags(tags?: string): string[] {
  if (!tags) return [];
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}

// ── Parse elements ──

function parseComponent(comp: StructurizrComponent): C4Element {
  return {
    id: comp.id,
    name: comp.name,
    description: comp.description,
    type: "component",
    technology: comp.technology,
    tags: parseTags(comp.tags),
    color: TYPE_COLORS.component,
  };
}

function parseContainer(container: StructurizrContainer): C4Element {
  const children = container.components?.map(parseComponent);
  return {
    id: container.id,
    name: container.name,
    description: container.description,
    type: "container",
    technology: container.technology,
    tags: parseTags(container.tags),
    color: TYPE_COLORS.container,
    children: children && children.length > 0 ? children : undefined,
  };
}

function parseSoftwareSystem(system: StructurizrSoftwareSystem): C4Element {
  const external = isExternal(system.tags, system.location);
  const children = system.containers?.map(parseContainer);
  return {
    id: system.id,
    name: system.name,
    description: system.description,
    type: "softwareSystem",
    tags: parseTags(system.tags),
    color: external ? EXTERNAL_COLOR : TYPE_COLORS.softwareSystem,
    children: children && children.length > 0 ? children : undefined,
  };
}

function parsePerson(person: StructurizrPerson): C4Element {
  const external = isExternal(person.tags, person.location);
  return {
    id: person.id,
    name: person.name,
    description: person.description,
    type: "person",
    tags: parseTags(person.tags),
    color: external ? EXTERNAL_COLOR : TYPE_COLORS.person,
  };
}

// ── Collect all relationships from the tree ──

function collectRelationships(
  people: StructurizrPerson[],
  systems: StructurizrSoftwareSystem[]
): C4Relationship[] {
  const relationships: C4Relationship[] = [];

  function addRels(rels?: StructurizrRelationship[]) {
    if (!rels) return;
    for (const rel of rels) {
      relationships.push({
        sourceId: rel.sourceId,
        destinationId: rel.destinationId,
        description: rel.description,
        technology: rel.technology,
      });
    }
  }

  for (const person of people) {
    addRels(person.relationships);
  }

  for (const system of systems) {
    addRels(system.relationships);
    if (system.containers) {
      for (const container of system.containers) {
        addRels(container.relationships);
        if (container.components) {
          for (const component of container.components) {
            addRels(component.relationships);
          }
        }
      }
    }
  }

  return relationships;
}

// ── Main parser ──

/**
 * Parse a Structurizr workspace JSON object into our internal C4Model.
 */
export function parseStructurizrWorkspace(workspace: StructurizrWorkspace): C4Model {
  const model = workspace.model;
  const people = model.people ?? [];
  const systems = model.softwareSystems ?? [];

  const elements: C4Element[] = [
    ...people.map(parsePerson),
    ...systems.map(parseSoftwareSystem),
  ];

  const relationships = collectRelationships(people, systems);

  return {
    name: workspace.name || "Workspace",
    description: workspace.description,
    elements,
    relationships,
  };
}

/**
 * Parse a JSON string into a C4Model.
 * Throws if the JSON is not a valid Structurizr workspace.
 */
export function parseStructurizrJSON(json: string): C4Model {
  const data = JSON.parse(json);

  if (!data.model) {
    throw new Error("Invalid Structurizr workspace: missing 'model' property");
  }

  return parseStructurizrWorkspace(data as StructurizrWorkspace);
}
