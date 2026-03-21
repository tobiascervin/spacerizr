import { C4Element, C4ElementType, C4Model, C4Relationship } from "./types";

/**
 * Structurizr DSL Parser
 * Parses .dsl text files into our internal C4Model.
 *
 * Supports:
 *   workspace, model, person, softwareSystem, container, component
 *   relationships (->), tags, description, technology, group
 */

// ── Color palette (matches JSON parser) ──

const TYPE_COLORS: Record<C4ElementType, string> = {
  person: "#08427b",
  softwareSystem: "#1168bd",
  container: "#438dd5",
  component: "#85bbf0",
};
const EXTERNAL_COLOR = "#999999";

// ── Tokenizer ──

interface Token {
  type: "string" | "word" | "lbrace" | "rbrace" | "arrow" | "newline" | "equals";
  value: string;
  line: number;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;

  while (i < input.length) {
    const ch = input[i];

    // Skip single-line comments
    if (ch === "/" && input[i + 1] === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    // Skip block comments
    if (ch === "/" && input[i + 1] === "*") {
      i += 2;
      while (i < input.length - 1 && !(input[i] === "*" && input[i + 1] === "/")) {
        if (input[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    // Skip # line comments
    if (ch === "#") {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }

    if (ch === "\n") {
      tokens.push({ type: "newline", value: "\n", line });
      line++;
      i++;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === "{") {
      tokens.push({ type: "lbrace", value: "{", line });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: "rbrace", value: "}", line });
      i++;
      continue;
    }
    if (ch === "=" && input[i + 1] === ">") {
      // Implied relationship form (rare, skip)
      i += 2;
      continue;
    }
    if (ch === "=") {
      tokens.push({ type: "equals", value: "=", line });
      i++;
      continue;
    }
    if (ch === "-" && input[i + 1] === ">") {
      tokens.push({ type: "arrow", value: "->", line });
      i += 2;
      continue;
    }

    // Quoted string
    if (ch === '"') {
      i++;
      let str = "";
      while (i < input.length && input[i] !== '"') {
        if (input[i] === "\\" && input[i + 1] === '"') {
          str += '"';
          i += 2;
        } else {
          if (input[i] === "\n") line++;
          str += input[i];
          i++;
        }
      }
      i++; // skip closing quote
      tokens.push({ type: "string", value: str, line });
      continue;
    }

    // Word (identifier/keyword)
    if (/[a-zA-Z_0-9.]/.test(ch)) {
      let word = "";
      while (i < input.length && /[a-zA-Z_0-9.\-]/.test(input[i])) {
        word += input[i];
        i++;
      }
      tokens.push({ type: "word", value: word, line });
      continue;
    }

    // Skip unknown characters
    i++;
  }

  return tokens;
}

// ── Parser State ──

interface DslElement {
  identifier: string;
  name: string;
  description?: string;
  technology?: string;
  tags: string[];
  type: C4ElementType;
  children: DslElement[];
  isExternal: boolean;
}

interface DslRelationship {
  sourceIdentifier: string;
  destIdentifier: string;
  description?: string;
  technology?: string;
}

class DslParser {
  private tokens: Token[];
  private pos = 0;
  private elements: DslElement[] = [];
  private relationships: DslRelationship[] = [];
  private identifiers = new Map<string, DslElement>();
  private idCounter = 1;
  private workspaceName = "Workspace";
  private workspaceDescription?: string;

  constructor(input: string) {
    this.tokens = tokenize(input);
  }

  parse(): C4Model {
    this.skipNewlines();

    // Check for workspace keyword or just model
    if (this.peekWord() === "workspace") {
      this.parseWorkspace();
    } else if (this.peekWord() === "model") {
      this.parseModel();
    } else {
      // Try parsing as implicit model
      this.parseModelBody();
    }

    return this.buildModel();
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private peekWord(): string | undefined {
    const t = this.peek();
    return t?.type === "word" ? t.value : undefined;
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: Token["type"], value?: string): Token {
    const t = this.advance();
    if (!t || t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(
        `DSL parse error at line ${t?.line ?? "?"}: expected ${type}${value ? ` "${value}"` : ""}, got ${t?.type ?? "EOF"} "${t?.value ?? ""}"`
      );
    }
    return t;
  }

  private skipNewlines(): void {
    while (this.peek()?.type === "newline") this.pos++;
  }

  private readStringOrWord(): string | undefined {
    const t = this.peek();
    if (!t) return undefined;
    if (t.type === "string" || t.type === "word") {
      this.pos++;
      return t.value;
    }
    return undefined;
  }

  // Read remaining quoted strings on the same "logical line" (before newline or brace)
  private readInlineStrings(): string[] {
    const result: string[] = [];
    while (true) {
      const t = this.peek();
      if (!t || t.type === "newline" || t.type === "lbrace" || t.type === "rbrace") break;
      if (t.type === "string") {
        result.push(t.value);
        this.pos++;
      } else {
        break;
      }
    }
    return result;
  }

  // ── Workspace ──

  private parseWorkspace(): void {
    this.expect("word", "workspace");
    // Optional name and description as inline strings
    const nameOrExtends = this.readStringOrWord();
    if (nameOrExtends === "extends") {
      // Skip extends URL
      this.readStringOrWord();
    } else if (nameOrExtends) {
      this.workspaceName = nameOrExtends;
    }
    const desc = this.readStringOrWord();
    if (desc) this.workspaceDescription = desc;

    this.skipNewlines();
    this.expect("lbrace");
    this.skipNewlines();

    while (this.peek() && this.peek()!.type !== "rbrace") {
      const kw = this.peekWord();
      if (kw === "model") {
        this.parseModel();
      } else if (kw === "views" || kw === "configuration" || kw === "properties") {
        this.skipBlock();
      } else if (kw === "name") {
        this.advance();
        const n = this.readStringOrWord();
        if (n) this.workspaceName = n;
      } else if (kw === "description") {
        this.advance();
        const d = this.readStringOrWord();
        if (d) this.workspaceDescription = d;
      } else {
        this.advance();
      }
      this.skipNewlines();
    }
    if (this.peek()?.type === "rbrace") this.advance();
  }

  // ── Model ──

  private parseModel(): void {
    this.expect("word", "model");
    this.skipNewlines();
    this.expect("lbrace");
    this.skipNewlines();
    this.parseModelBody();
    this.expect("rbrace");
  }

  private parseModelBody(): void {
    while (this.peek() && this.peek()!.type !== "rbrace") {
      this.parseModelStatement(null);
      this.skipNewlines();
    }
  }

  private parseModelStatement(parent: DslElement | null): void {
    const t = this.peek();
    if (!t || t.type === "rbrace") return;

    // Check for: identifier = keyword ...
    if (t.type === "word") {
      const nextNonNL = this.tokens[this.pos + 1];
      if (nextNonNL?.type === "equals") {
        return this.parseAssignment(parent);
      }
    }

    // Check for relationship: -> destination "desc" "tech"
    if (t.type === "arrow") {
      return this.parseImplicitRelationship(parent);
    }

    const kw = this.peekWord();
    switch (kw) {
      case "person":
        this.advance();
        this.parseElementDecl("person", parent);
        break;
      case "softwareSystem":
      case "softwaresystem":
        this.advance();
        this.parseElementDecl("softwareSystem", parent);
        break;
      case "container":
        this.advance();
        this.parseElementDecl("container", parent);
        break;
      case "component":
        this.advance();
        this.parseElementDecl("component", parent);
        break;
      case "group":
        this.advance();
        this.readStringOrWord(); // group name
        this.skipNewlines();
        if (this.peek()?.type === "lbrace") {
          this.advance();
          this.skipNewlines();
          while (this.peek() && this.peek()!.type !== "rbrace") {
            this.parseModelStatement(parent);
            this.skipNewlines();
          }
          if (this.peek()?.type === "rbrace") this.advance();
        }
        break;
      case "deploymentEnvironment":
      case "deploymentNode":
      case "infrastructureNode":
      case "containerInstance":
      case "softwareSystemInstance":
        this.skipBlock();
        break;
      case "tags":
        this.advance();
        if (parent) {
          const tagStrs = this.readInlineStrings();
          for (const ts of tagStrs) {
            parent.tags.push(
              ...ts.split(",").map((t) => t.trim()).filter(Boolean)
            );
          }
        }
        break;
      case "description":
        this.advance();
        if (parent) {
          const d = this.readStringOrWord();
          if (d) parent.description = d;
        }
        break;
      case "technology":
        this.advance();
        if (parent) {
          const tech = this.readStringOrWord();
          if (tech) parent.technology = tech;
        }
        break;
      default:
        // Could be identifier -> dest relationship
        if (t.type === "word") {
          const next = this.tokens[this.pos + 1];
          if (next?.type === "arrow") {
            return this.parseExplicitRelationship();
          }
        }
        // Skip unknown
        this.advance();
        break;
    }
  }

  // ── Assignment: identifier = keyword "Name" "Desc" { ... } ──

  private parseAssignment(parent: DslElement | null): void {
    const identToken = this.advance(); // identifier
    this.expect("equals");
    const kw = this.peekWord();

    let type: C4ElementType;
    switch (kw) {
      case "person":
        type = "person";
        this.advance();
        break;
      case "softwareSystem":
      case "softwaresystem":
        type = "softwareSystem";
        this.advance();
        break;
      case "container":
        type = "container";
        this.advance();
        break;
      case "component":
        type = "component";
        this.advance();
        break;
      default:
        // Unknown assignment, skip line
        while (this.peek() && this.peek()!.type !== "newline" && this.peek()!.type !== "lbrace") {
          this.advance();
        }
        if (this.peek()?.type === "lbrace") this.skipBraceBlock();
        return;
    }

    this.parseElementDecl(type, parent, identToken.value);
  }

  // ── Element declaration ──

  private parseElementDecl(
    type: C4ElementType,
    parent: DslElement | null,
    identifier?: string
  ): void {
    // Read inline args: name [description] [technology] [tags]
    const inlineArgs = this.readInlineStrings();
    const name = inlineArgs[0] ?? "Unnamed";
    const description = inlineArgs[1];
    // For container/component, 3rd arg is technology; for person/softwareSystem it's tags
    let technology: string | undefined;
    let inlineTags: string | undefined;
    if (type === "container" || type === "component") {
      technology = inlineArgs[2];
      inlineTags = inlineArgs[3];
    } else {
      inlineTags = inlineArgs[2];
    }

    const el: DslElement = {
      identifier: identifier ?? `_auto_${this.idCounter++}`,
      name,
      description,
      technology,
      tags: [],
      type,
      children: [],
      isExternal: false,
    };

    if (inlineTags) {
      el.tags.push(
        ...inlineTags.split(",").map((t) => t.trim()).filter(Boolean)
      );
    }

    // Check for External tag
    if (el.tags.some((t) => t === "External")) {
      el.isExternal = true;
    }

    // Register identifier
    this.identifiers.set(el.identifier, el);

    // Parse body if present
    this.skipNewlines();
    if (this.peek()?.type === "lbrace") {
      this.advance();
      this.skipNewlines();
      while (this.peek() && this.peek()!.type !== "rbrace") {
        this.parseModelStatement(el);
        this.skipNewlines();
      }
      if (this.peek()?.type === "rbrace") this.advance();
    }

    // Re-check external after body parsing (tags may have been added inside body)
    if (el.tags.some((t) => t === "External")) {
      el.isExternal = true;
    }

    // Add to parent or top-level
    if (parent) {
      parent.children.push(el);
    } else {
      this.elements.push(el);
    }
  }

  // ── Relationships ──

  private parseImplicitRelationship(parent: DslElement | null): void {
    this.expect("arrow");
    const destIdent = this.readStringOrWord();
    const inlineArgs = this.readInlineStrings();

    if (parent && destIdent) {
      this.relationships.push({
        sourceIdentifier: parent.identifier,
        destIdentifier: destIdent,
        description: inlineArgs[0],
        technology: inlineArgs[1],
      });
    }
  }

  private parseExplicitRelationship(): void {
    const sourceIdent = this.advance().value; // source identifier
    this.expect("arrow");
    const destIdent = this.readStringOrWord();
    const inlineArgs = this.readInlineStrings();

    if (destIdent) {
      this.relationships.push({
        sourceIdentifier: sourceIdent,
        destIdentifier: destIdent,
        description: inlineArgs[0],
        technology: inlineArgs[1],
      });
    }

    // Relationships can optionally have a body block
    this.skipNewlines();
    if (this.peek()?.type === "lbrace") {
      this.skipBraceBlock();
    }
  }

  // ── Helpers ──

  private skipBlock(): void {
    // Skip keyword + optional inline tokens + brace block
    this.advance();
    while (this.peek() && this.peek()!.type !== "lbrace" && this.peek()!.type !== "newline") {
      this.advance();
    }
    this.skipNewlines();
    if (this.peek()?.type === "lbrace") {
      this.skipBraceBlock();
    }
  }

  private skipBraceBlock(): void {
    this.expect("lbrace");
    let depth = 1;
    while (depth > 0 && this.peek()) {
      const t = this.advance();
      if (t.type === "lbrace") depth++;
      if (t.type === "rbrace") depth--;
    }
  }

  // ── Build C4Model ──

  private buildModel(): C4Model {
    const c4Elements: C4Element[] = [];
    const c4Relationships: C4Relationship[] = [];

    // Create a map from identifier → generated ID
    const identToId = new Map<string, string>();
    let nextId = 1;

    const assignIds = (elements: DslElement[]) => {
      for (const el of elements) {
        const id = String(nextId++);
        identToId.set(el.identifier, id);
        assignIds(el.children);
      }
    };
    assignIds(this.elements);

    // Convert DslElements to C4Elements
    const convertElement = (el: DslElement): C4Element => {
      const id = identToId.get(el.identifier) ?? el.identifier;
      const children =
        el.children.length > 0
          ? el.children.map(convertElement)
          : undefined;

      return {
        id,
        name: el.name,
        description: el.description,
        type: el.type,
        technology: el.technology,
        tags: el.tags.length > 0 ? el.tags : undefined,
        color: el.isExternal ? EXTERNAL_COLOR : TYPE_COLORS[el.type],
        children,
      };
    };

    for (const el of this.elements) {
      c4Elements.push(convertElement(el));
    }

    // Convert relationships
    for (const rel of this.relationships) {
      const sourceId = identToId.get(rel.sourceIdentifier);
      const destId = identToId.get(rel.destIdentifier);
      if (sourceId && destId) {
        c4Relationships.push({
          sourceId,
          destinationId: destId,
          description: rel.description,
          technology: rel.technology,
        });
      }
    }

    return {
      name: this.workspaceName,
      description: this.workspaceDescription,
      elements: c4Elements,
      relationships: c4Relationships,
    };
  }
}

// ── Public API ──

/**
 * Parse a Structurizr DSL string into a C4Model.
 */
export function parseStructurizrDSL(dsl: string): C4Model {
  const parser = new DslParser(dsl);
  return parser.parse();
}
