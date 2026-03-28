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

/** Visual shape for rendering */
export type C4Shape = "box" | "person" | "database" | "queue" | "gateway" | "browser" | "mobile" | "cloud" | "firewall";

/** Determine the visual shape for an element based on type, technology, and tags */
export function getElementShape(el: C4Element): C4Shape {
  if (el.type === "person") return "person";

  const tech = (el.technology ?? "").toLowerCase();
  const name = el.name.toLowerCase();
  const tags = (el.tags ?? []).map((t) => t.toLowerCase());
  const all = `${tech} ${name} ${tags.join(" ")}`;

  // Database / storage
  if (/\b(sql|database|postgres|mysql|mongo|dynamo|redis|sqlite|mariadb|couchdb|cassandra|elastic|elasticsearch)\b/.test(all)) return "database";
  // Message queue / event bus
  if (/\b(queue|kafka|rabbit|rabbitmq|sqs|sns|pubsub|nats|activemq|zeromq|event.?bus|message.?bus|message.?broker|stream)\b/.test(all)) return "queue";
  // API gateway / load balancer / proxy
  if (/\b(gateway|api.?gateway|kong|nginx|envoy|traefik|haproxy|load.?balancer|reverse.?proxy|ingress)\b/.test(all)) return "gateway";
  // Browser / web app / frontend
  if (/\b(browser|web.?app|react|angular|vue|svelte|next\.?js|nuxt|spa|frontend|single.?page)\b/.test(all)) return "browser";
  // Mobile app
  if (/\b(mobile|ios|android|react.?native|flutter|swift|kotlin|mobile.?app)\b/.test(all)) return "mobile";
  // Cloud / external service
  if (/\b(cloud|aws|azure|gcp|s3|blob|cdn|saas|external.?service|third.?party|lambda|function)\b/.test(all)) return "cloud";
  // Firewall / security
  if (/\b(firewall|waf|security|auth|oauth|identity|idp|iam|vault|cert|ssl|tls)\b/.test(all)) return "firewall";

  return "box";
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
