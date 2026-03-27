/**
 * PlantUML C4 renderer — converts C4Model to PlantUML diagram syntax.
 * Pure function, no DOM dependencies.
 */

import { C4Element, C4Model, ViewState } from "./types";

export interface PlantUMLOptions {
  viewState?: ViewState;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function isExternal(el: C4Element): boolean {
  return el.color === "#999999" || el.tags?.includes("External") === true;
}

function elementToPlantUML(el: C4Element): string {
  const id = sanitizeId(el.id);
  const desc = el.description ? `, "${el.description}"` : "";

  if (el.type === "person") {
    return isExternal(el)
      ? `Person_Ext(${id}, "${el.name}"${desc})`
      : `Person(${id}, "${el.name}"${desc})`;
  }

  if (el.type === "container") {
    const tech = el.technology ? `, "${el.technology}"` : "";
    return isExternal(el)
      ? `Container_Ext(${id}, "${el.name}"${tech}${desc})`
      : `Container(${id}, "${el.name}"${tech}${desc})`;
  }

  if (el.type === "component") {
    const tech = el.technology ? `, "${el.technology}"` : "";
    return isExternal(el)
      ? `Component_Ext(${id}, "${el.name}"${tech}${desc})`
      : `Component(${id}, "${el.name}"${tech}${desc})`;
  }

  // softwareSystem
  return isExternal(el)
    ? `System_Ext(${id}, "${el.name}"${desc})`
    : `System(${id}, "${el.name}"${desc})`;
}

export function renderPlantUML(model: C4Model, options: PlantUMLOptions = {}): string {
  const elements = options.viewState ? options.viewState.visibleElements : model.elements;
  const relationships = options.viewState ? options.viewState.visibleRelationships : model.relationships;

  const hasContainers = elements.some((e) => e.type === "container");
  const hasComponents = elements.some((e) => e.type === "component");
  const includeFile = hasComponents ? "C4_Component" : hasContainers ? "C4_Container" : "C4_Context";

  const lines: string[] = [];
  lines.push("@startuml");
  lines.push(`!include <C4/${includeFile}>`);
  lines.push("");
  lines.push(`title ${model.name}`);
  lines.push("");

  for (const el of elements) {
    lines.push(elementToPlantUML(el));
  }

  lines.push("");

  for (const rel of relationships) {
    const from = sanitizeId(rel.sourceId);
    const to = sanitizeId(rel.destinationId);
    const desc = rel.description ? `, "${rel.description}"` : "";
    const tech = rel.technology ? `, "${rel.technology}"` : "";
    lines.push(`Rel(${from}, ${to}${desc}${tech})`);
  }

  lines.push("");
  lines.push("@enduml");

  return lines.join("\n") + "\n";
}
