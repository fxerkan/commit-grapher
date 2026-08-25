// App-wide settings, persisted to localStorage and live-subscribed via useSyncExternalStore
// (React built-in — no store dependency). Every view reads defaults/config from here so the
// Settings page is the single place that configures the whole app.
import { useSyncExternalStore } from "react";

export type NodeType = "account" | "repo" | "branch" | "pr" | "commit" | "workitem";
export const ALL_NODE_TYPES: NodeType[] = ["account", "repo", "branch", "pr", "commit", "workitem"];
export type Physics = "off" | "low" | "balanced" | "high";
export type LandingTab = "graph" | "heatmap" | "stats" | "contributors";

export type Lang = "en" | "tr";

export interface AppSettings {
  // General
  language: Lang;                 // UI language
  theme: "dark" | "light";
  accent: string;                 // primary accent color (CSS --accent)
  landingTab: LandingTab;         // which tab opens on launch
  // Network graph — layout / animation
  physics: Physics;               // ForceAtlas2 effort (off = keep scatter positions)
  gravity: number;                // ForceAtlas2 gravity
  scaling: number;                // ForceAtlas2 scalingRatio (node spread)
  labelDensity: number;          // sigma labelRenderedSizeThreshold (lower = more labels)
  showArrows: boolean;            // default: draw relationship arrows
  introAnimation: boolean;        // staged node-by-node reveal on first graph load
  introSeconds: number;           // how long that reveal takes, in seconds
  nodeShapes: boolean;            // distinct pictogram shapes per node type (PR, work item, …)
  defaultNodeTypes: NodeType[];   // node types visible by default
  // Default filters (applied when the graph first loads)
  defaultProvider: string;        // "" = all providers
  defaultHumanAI: "all" | "human" | "ai";
  defaultOnlyMine: boolean;
  myNames: string;                // comma-separated names for "only my activity"
  // Fun facts
  showFacts: boolean;             // show the Fun Facts cards on the Stats page
}

export const DEFAULTS: AppSettings = {
  language: "en",
  theme: "dark",
  accent: "#58a6ff",
  landingTab: "graph",
  physics: "balanced",
  gravity: 1,
  scaling: 25,
  labelDensity: 6,
  showArrows: false,
  introAnimation: true,
  introSeconds: 6,
  nodeShapes: true,
  defaultNodeTypes: [...ALL_NODE_TYPES],
  defaultProvider: "",
  defaultHumanAI: "all",
  defaultOnlyMine: false,
  myNames: "",
  showFacts: true,
};

const KEY = "cg_settings";

function load(): AppSettings {
  let saved: Partial<AppSettings> = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { /* ignore */ }
  // one-time migration from the pre-settings localStorage keys
  const legacy: Partial<AppSettings> = {};
  const t = localStorage.getItem("theme"); if (t === "dark" || t === "light") legacy.theme = t;
  const mn = localStorage.getItem("myNames"); if (mn) legacy.myNames = mn;
  return { ...DEFAULTS, ...legacy, ...saved };
}

let current = load();
const listeners = new Set<() => void>();

export function getSettings(): AppSettings { return current; }

export function setSettings(patch: Partial<AppSettings>): void {
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  listeners.forEach((l) => l());
}

export function resetSettings(): void {
  current = { ...DEFAULTS };
  localStorage.setItem(KEY, JSON.stringify(current));
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Live settings hook — components re-render when any setting changes. */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

// Map the physics level to a ForceAtlas2 iteration budget, scaled down for huge graphs.
export function physicsIterations(level: Physics, order: number): number {
  const base: Record<Physics, number> = { off: 0, low: 60, balanced: 120, high: 260 };
  let it = base[level];
  if (order > 4000) it = Math.min(it, 40);
  else if (order > 1500) it = Math.min(it, 90);
  return it;
}
