/** Global display settings, controlled by the UI panel */
export interface DisplaySettings {
  particlesEnabled: boolean;
  particleSpeed: number;
  floatingEnabled: boolean;
  floatSpeed: number;
  viewMode: "3d" | "2d";
  theme: "light" | "dark";
  showRelationshipLabels: boolean;
}

const prefersDark = typeof window !== "undefined"
  ? window.matchMedia("(prefers-color-scheme: dark)").matches
  : true;

export const settings: DisplaySettings = {
  particlesEnabled: true,
  particleSpeed: 1.0,
  floatingEnabled: true,
  floatSpeed: 1.0,
  viewMode: "3d",
  theme: prefersDark ? "dark" : "light",
  showRelationshipLabels: true,
};

type Listener = () => void;
const listeners: Listener[] = [];

export function onSettingsChange(fn: Listener): void {
  listeners.push(fn);
}

export function notifySettingsChange(): void {
  for (const fn of listeners) fn();
}

// ── Shared theme palettes ──

export interface ThemeColors {
  bg: string;
  groundColor: number;
  gridColor: number;
  fogDensity: number;
  labelShadow: string;
  relLineColor: number;
  relLineOpacity: number;
  relLabelColor: string;
  particleColor: number;
  ringColor: number;
  shadowOpacity: number;
  element: Record<string, { fill: string; border: string; text: string }>;
}

const LIGHT_ELEMENTS: Record<string, { fill: string; border: string; text: string }> = {
  person:         { fill: "#dbeafe", border: "#3b82f6", text: "#1e3a5f" },
  softwareSystem: { fill: "#e0e7ff", border: "#6366f1", text: "#312e81" },
  container:      { fill: "#ede9fe", border: "#8b5cf6", text: "#4c1d95" },
  component:      { fill: "#f3e8ff", border: "#a78bfa", text: "#581c87" },
  external:       { fill: "#f1f5f9", border: "#94a3b8", text: "#475569" },
};

const DARK_ELEMENTS: Record<string, { fill: string; border: string; text: string }> = {
  person:         { fill: "#1e3a5f", border: "#60a5fa", text: "#dbeafe" },
  softwareSystem: { fill: "#2e1065", border: "#818cf8", text: "#e0e7ff" },
  container:      { fill: "#3b0764", border: "#a78bfa", text: "#ede9fe" },
  component:      { fill: "#4c1d95", border: "#c4b5fd", text: "#f3e8ff" },
  external:       { fill: "#1e293b", border: "#64748b", text: "#e2e8f0" },
};

export const THEMES: Record<string, ThemeColors> = {
  light: {
    bg: "#fafafa",
    groundColor: 0xf5f5f5,
    gridColor: 0xe0e0e0,
    fogDensity: 0.018,
    labelShadow: "rgba(0,0,0,0.12)",
    relLineColor: 0x94a3b8,
    relLineOpacity: 0.45,
    relLabelColor: "rgba(100,116,139,0.75)",
    particleColor: 0x6366f1,
    ringColor: 0x6366f1,
    shadowOpacity: 0.06,
    element: LIGHT_ELEMENTS,
  },
  dark: {
    bg: "#0f0f1a",
    groundColor: 0x12122a,
    gridColor: 0x2a2a4a,
    fogDensity: 0.03,
    labelShadow: "rgba(0,0,0,0.6)",
    relLineColor: 0x4f46e5,
    relLineOpacity: 0.4,
    relLabelColor: "rgba(180,190,255,0.6)",
    particleColor: 0x818cf8,
    ringColor: 0xffffff,
    shadowOpacity: 0.15,
    element: DARK_ELEMENTS,
  },
};

export function getTheme(): ThemeColors {
  return THEMES[settings.theme];
}

export function getElementPalette(el: { type: string; color?: string; tags?: string[] }) {
  const theme = getTheme();
  if (el.color === "#999999" || el.tags?.includes("External")) return theme.element.external;
  return theme.element[el.type] || theme.element.softwareSystem;
}
