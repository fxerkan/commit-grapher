// Graph "power tools" layered on GraphView's Sigma instance: reliable camera fit, a
// worker-driven continuous force layout (start/stop like sigmajs.org), a layout switcher,
// cluster-by recoloring, distinct node shapes, and live statistics. Kept out of
// GraphView.tsx so that already-large file stays about wiring, not features.
import { useEffect, useMemo, useRef } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import { useSigma } from "@react-sigma/core";
import { GraphData } from "./api";

export type LayoutKind = "forceatlas2" | "circular" | "grid" | "random";
export type ClusterBy = "none" | "account" | "workspace" | "repo" | "org";

// ---- reliable "fit whole graph / zoom to focus" ----------------------------
// Sigma's auto-rescale lazily under-frames big graphs on first load (the camera sits at the
// default 1:1 but only a slice of the graph shows). Pinning a customBBox to the TRUE node
// extent forces a correct one-shot frame; animatedReset then applies it.
export function fitView(sigma: any, focus: number | null): void {
  const g = sigma.getGraph();
  if (g.order > 0) {
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    g.forEachNode((_k: string, a: any) => {
      if (a.x < minx) minx = a.x; if (a.x > maxx) maxx = a.x;
      if (a.y < miny) miny = a.y; if (a.y > maxy) maxy = a.y;
    });
    if (isFinite(minx)) sigma.setCustomBBox({ x: [minx, maxx], y: [miny, maxy] });
  }
  sigma.refresh();  // re-applies the custom bbox to the coordinate frame
  requestAnimationFrame(() => {
    const cam = sigma.getCamera();
    if (focus != null) {
      const nd = sigma.getNodeDisplayData(`repo:${focus}`);
      if (nd) { cam.animate({ x: nd.x, y: nd.y, ratio: 0.4 }, { duration: 500 }); return; }
    }
    cam.animatedReset({ duration: 400 });
  });
}

// Refit whenever `trigger` changes (new data, intro finished, layout changed).
// animatedReset reframes the graph as a side effect (it forces Sigma to recompute its
// coordinate extent), but only once the graph has actually painted with its final positions —
// which for thousands of nodes isn't true immediately. So we fire a few times at increasing
// delays; the last one lands after the layout has settled. Re-fitting to the same frame is a
// no-op animation, so the extra calls are invisible.
export function FitControl({ trigger, focus }: { trigger: number; focus: number | null }) {
  const sigma = useSigma();
  useEffect(() => {
    // Fit once the graph has settled: re-arm a short idle timer on every render, and fit when the
    // renders stop (layout done, reducers applied). A backstop covers the case where rendering
    // finished before we attached. `trigger` re-arms this on new data / facets / layout change.
    let idle = 0, done = false;
    const fit = () => { if (done) return; done = true; sigma.off("afterRender", onRender); clearTimeout(backstop); fitView(sigma, focus); };
    const onRender = () => { clearTimeout(idle); idle = window.setTimeout(fit, 400); };
    sigma.on("afterRender", onRender);
    const backstop = window.setTimeout(fit, 2500);
    return () => { done = true; sigma.off("afterRender", onRender); clearTimeout(idle); clearTimeout(backstop); };
  }, [trigger, sigma, focus]);
  return null;
}

// ---- node shapes -----------------------------------------------------------
// Monochrome SVGs (tinted by the node color via NodePictogramProgram). PRs and work
// items get their own glyph so they read at a glance; the rest stay plain circles.
const svg = (inner: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff">${inner}</svg>`);

export const SHAPE_IMG: Partial<Record<string, string>> = {
  pr: svg('<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><rect x="5" y="8" width="2" height="8"/><path d="M18 15.6V9a3 3 0 0 0-3-3h-3l2.2-2.2L12.8 2.4 8.2 7l4.6 4.6 1.4-1.4L12 8h3a1 1 0 0 1 1 1v6.6z"/>'),
  workitem: svg('<rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1" fill="#000" opacity="0.35"/><rect x="8" y="10" width="8" height="1.6" fill="#000" opacity="0.5"/><rect x="8" y="14" width="8" height="1.6" fill="#000" opacity="0.5"/>'),
};

export function applyNodeShapes(g: Graph, on: boolean): void {
  g.forEachNode((k, a) => {
    const img = on ? SHAPE_IMG[a.nodeType] : undefined;
    if (img) { g.setNodeAttribute(k, "type", "pictogram"); g.setNodeAttribute(k, "image", img); }
    else if (a.type === "pictogram") { g.removeNodeAttribute(k, "type"); g.removeNodeAttribute(k, "image"); }
  });
}

export function ShapeControl({ on, dataKey }: { on: boolean; dataKey: string }) {
  const sigma = useSigma();
  useEffect(() => { applyNodeShapes(sigma.getGraph(), on); sigma.refresh(); }, [on, dataKey, sigma]);
  return null;
}

// ---- continuous layout (the "start layout animation" button) ---------------
// Uses the ForceAtlas2 web-worker supervisor (ships with graphology-layout-forceatlas2):
// off-thread, stable, and self-centering, so nodes don't drift off-screen like a hand-rolled
// per-frame assign would.
export function AnimateControl({ running, gravity, scaling }: {
  running: boolean; gravity: number; scaling: number;
}) {
  const sigma = useSigma();
  useEffect(() => {
    if (!running) return;
    const g = sigma.getGraph();
    if (g.order < 2) return;
    const layout = new FA2Layout(g, {
      settings: { gravity, scalingRatio: scaling, slowDown: 8, barnesHutOptimize: g.order > 500, adjustSizes: true },
    });
    layout.start();
    return () => { layout.stop(); layout.kill(); };
  }, [running, sigma, gravity, scaling]);
  return null;
}

// ---- layout switcher -------------------------------------------------------
export function LayoutControl({ layout, gravity, scaling, onApplied }: {
  layout: LayoutKind; gravity: number; scaling: number; onApplied: () => void;
}) {
  const sigma = useSigma();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }  // initial FA2 already ran in LoadGraph
    const g = sigma.getGraph();
    const n = g.order;
    if (layout === "forceatlas2") {
      if (n > 1) forceAtlas2.assign(g, { iterations: 200, settings: { gravity, scalingRatio: scaling, barnesHutOptimize: n > 500 } });
    } else if (layout === "circular") {
      let i = 0; const R = Math.max(80, n * 2);
      g.forEachNode((k) => { const a = (2 * Math.PI * i++) / n; g.setNodeAttribute(k, "x", Math.cos(a) * R); g.setNodeAttribute(k, "y", Math.sin(a) * R); });
    } else if (layout === "grid") {
      const cols = Math.ceil(Math.sqrt(n)); const gap = 20; let i = 0;
      g.forEachNode((k) => { g.setNodeAttribute(k, "x", (i % cols) * gap); g.setNodeAttribute(k, "y", Math.floor(i / cols) * gap); i++; });
    } else {  // random
      const R = Math.max(80, n * 1.2);
      g.forEachNode((k) => { g.setNodeAttribute(k, "x", (Math.random() - 0.5) * R); g.setNodeAttribute(k, "y", (Math.random() - 0.5) * R); });
    }
    sigma.refresh();
    onApplied();  // trigger a fit
  }, [layout]);  // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ---- cluster-by (recolor nodes by a chosen grouping) -----------------------
// Distinct hue per group so grouped subtrees read at a glance (like community colors).
// Sigma's WebGL renderer only parses hex/rgb — NOT hsl() — so emit hex.
function hslHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const to = (x: number) => Math.round(255 * x).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}
const groupColor = (i: number, total: number) => hslHex(Math.round((360 * i) / Math.max(1, total)), 65, 58);

// node key -> the account it belongs to (account → repo → children, via outgoing edges).
function accountOwner(data: GraphData): Map<string, string> {
  const out = new Map<string, string[]>();
  data.edges.forEach((e) => { const a = out.get(e.source) || []; a.push(e.target); out.set(e.source, a); });
  const owner = new Map<string, string>();
  for (const acc of data.nodes.filter((n) => n.attributes.nodeType === "account")) {
    const stack = [acc.key];
    while (stack.length) { const k = stack.pop()!; if (owner.has(k)) continue; owner.set(k, acc.key); for (const c of out.get(k) || []) stack.push(c); }
  }
  return owner;
}

// Returns null (no recolor) for "none", else a nodeKey → color map for the chosen grouping.
export function nodeGroupColors(data: GraphData | null, by: ClusterBy): Map<string, string> | null {
  if (!data || by === "none") return null;
  const owner = by === "account" ? accountOwner(data) : null;
  const keyOf = (n: { key: string; attributes: any }): string | null => {
    const a = n.attributes;
    if (by === "account") return owner!.get(n.key) ?? null;
    if (by === "workspace") return a.project ? `w:${a.project}` : null;
    if (by === "org") return a.organization ? `o:${a.organization}` : null;
    if (by === "repo") return a.repoId != null ? `r:${a.repoId}` : (n.key.startsWith("repo:") ? n.key : null);
    return null;
  };
  const groups: string[] = [];
  const idx = new Map<string, number>();
  const nodeKeyGroup = new Map<string, string>();
  for (const n of data.nodes) {
    const g = keyOf(n);
    if (g == null) continue;
    if (!idx.has(g)) { idx.set(g, groups.length); groups.push(g); }
    nodeKeyGroup.set(n.key, g);
  }
  const out = new Map<string, string>();
  nodeKeyGroup.forEach((g, k) => out.set(k, groupColor(idx.get(g)!, groups.length)));
  return out;
}

// ---- graph statistics ------------------------------------------------------
export interface GraphStats { totalNodes: number; totalEdges: number; visibleNodes: number; visibleEdges: number; density: number; avgDegree: number; }

export function computeStats(total: { nodes: number; edges: number }, visible: { nodes: number; edges: number }): GraphStats {
  const n = visible.nodes, e = visible.edges;
  return {
    totalNodes: total.nodes, totalEdges: total.edges, visibleNodes: n, visibleEdges: e,
    density: n > 1 ? (2 * e) / (n * (n - 1)) : 0,
    avgDegree: n ? (2 * e) / n : 0,
  };
}

// Performance cap — keep structural nodes, drop the most numerous (commits) first.
const CAP_RANK: Record<string, number> = { account: 0, repo: 1, branch: 2, workitem: 3, pr: 4, commit: 5 };
export function useCapHidden(data: GraphData | null, cap: number): Set<string> {
  return useMemo(() => {
    if (!data || cap >= data.nodes.length) return new Set<string>();
    const ranked = [...data.nodes].sort((a, b) => (CAP_RANK[a.attributes.nodeType] ?? 9) - (CAP_RANK[b.attributes.nodeType] ?? 9));
    return new Set(ranked.slice(cap).map((n) => n.key));
  }, [data, cap]);
}
