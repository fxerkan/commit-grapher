// Graph "power tools" that layer on top of GraphView's Sigma instance: continuous
// force layout (start/stop like sigmajs.org), a layout switcher, per-account cluster
// labels, distinct node shapes, and live graph statistics. Kept out of GraphView.tsx so
// that already-large file stays about wiring, not features.
import { useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { useSigma } from "@react-sigma/core";
import { GraphData } from "./api";

export type LayoutKind = "forceatlas2" | "circular" | "grid" | "random";

// ---- node shapes -----------------------------------------------------------
// Monochrome SVGs (tinted by the node color via NodePictogramProgram). PRs and work
// items get their own glyph so they read at a glance; the rest stay plain circles.
const svg = (inner: string) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff">${inner}</svg>`);

export const SHAPE_IMG: Partial<Record<string, string>> = {
  // git-pull-request glyph
  pr: svg('<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><rect x="5" y="8" width="2" height="8"/><path d="M18 15.6V9a3 3 0 0 0-3-3h-3l2.2-2.2L12.8 2.4 8.2 7l4.6 4.6 1.4-1.4L12 8h3a1 1 0 0 1 1 1v6.6z"/>'),
  // clipboard / ticket glyph for work items
  workitem: svg('<rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1" fill="#000" opacity="0.35"/><rect x="8" y="10" width="8" height="1.6" fill="#000" opacity="0.5"/><rect x="8" y="14" width="8" height="1.6" fill="#000" opacity="0.5"/>'),
};

// Give shaped nodes a pictogram type + image; others keep the default circle program.
export function applyNodeShapes(g: Graph, on: boolean): void {
  g.forEachNode((k, a) => {
    const img = on ? SHAPE_IMG[a.nodeType] : undefined;
    if (img) { g.setNodeAttribute(k, "type", "pictogram"); g.setNodeAttribute(k, "image", img); }
    else if (a.type === "pictogram") { g.removeNodeAttribute(k, "type"); g.removeNodeAttribute(k, "image"); }
  });
}

// ---- continuous layout (the "start layout animation" button) ---------------
export function AnimateControl({ running, draggingRef, gravity, scaling }: {
  running: boolean; draggingRef: React.MutableRefObject<boolean>; gravity: number; scaling: number;
}) {
  const sigma = useSigma();
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const g = sigma.getGraph();
    const settings = { gravity, scalingRatio: scaling, slowDown: 10, barnesHutOptimize: g.order > 500 };
    const tick = () => {
      if (!draggingRef.current && g.order > 1) forceAtlas2.assign(g, { iterations: 1, settings });
      sigma.refresh({ skipIndexation: true });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, sigma, gravity, scaling, draggingRef]);
  return null;
}

// ---- layout switcher -------------------------------------------------------
export function LayoutControl({ layout, gravity, scaling }: { layout: LayoutKind; gravity: number; scaling: number }) {
  const sigma = useSigma();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }  // initial FA2 already ran in LoadGraph
    const g = sigma.getGraph();
    const n = g.order;
    if (layout === "forceatlas2") {
      if (n > 1) forceAtlas2.assign(g, { iterations: 120, settings: { gravity, scalingRatio: scaling } });
    } else if (layout === "circular") {
      let i = 0; const R = Math.max(60, n * 1.4);
      g.forEachNode((k) => { const a = (2 * Math.PI * i++) / n; g.setNodeAttribute(k, "x", Math.cos(a) * R); g.setNodeAttribute(k, "y", Math.sin(a) * R); });
    } else if (layout === "grid") {
      const cols = Math.ceil(Math.sqrt(n)); const gap = 12; let i = 0;
      g.forEachNode((k) => { g.setNodeAttribute(k, "x", (i % cols) * gap); g.setNodeAttribute(k, "y", Math.floor(i / cols) * gap); i++; });
    } else {  // random
      const R = Math.max(60, n);
      g.forEachNode((k) => { g.setNodeAttribute(k, "x", (Math.random() - 0.5) * R); g.setNodeAttribute(k, "y", (Math.random() - 0.5) * R); });
    }
    sigma.getCamera().animatedReset({ duration: 400 });
    sigma.refresh();
  }, [layout]);  // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ---- per-account clustering ------------------------------------------------
export interface AccountCluster { key: string; label: string; color: string; members: string[]; }

// Distinct hue per account so clusters are visually separable (like community colors).
const accountColor = (i: number, total: number) => `hsl(${Math.round((360 * i) / Math.max(1, total))} 70% 60%)`;

// Each account owns every node reachable from it via outgoing edges (account → repo → …).
export function accountClusters(data: GraphData): AccountCluster[] {
  const out = new Map<string, string[]>();
  data.edges.forEach((e) => { const a = out.get(e.source) || []; a.push(e.target); out.set(e.source, a); });
  const accounts = data.nodes.filter((n) => n.attributes.nodeType === "account");
  return accounts.map((acc, i) => {
    const members: string[] = [], seen = new Set<string>([acc.key]);
    const stack = [acc.key];
    while (stack.length) { const k = stack.pop()!; members.push(k); for (const c of out.get(k) || []) if (!seen.has(c)) { seen.add(c); stack.push(c); } }
    return { key: acc.key, label: acc.attributes.label || acc.key, color: accountColor(i, accounts.length), members };
  });
}

// Floating account name at each cluster's centroid, following the camera every frame.
export function ClusterLabels({ enabled, clusters }: { enabled: boolean; clusters: AccountCluster[] }) {
  const sigma = useSigma();
  const [pts, setPts] = useState<{ key: string; label: string; color: string; x: number; y: number }[]>([]);
  useEffect(() => {
    if (!enabled) { setPts([]); return; }
    let raf = 0;
    const tick = () => {
      const g = sigma.getGraph();
      const next = clusters.map((c) => {
        let sx = 0, sy = 0, n = 0;
        for (const k of c.members) {
          if (!g.hasNode(k)) continue;
          const d = sigma.getNodeDisplayData(k);
          if (!d || (d as any).hidden) continue;
          sx += d.x; sy += d.y; n++;
        }
        if (!n) return null;
        const v = sigma.graphToViewport({ x: sx / n, y: sy / n });
        return { key: c.key, label: c.label, color: c.color, x: v.x, y: v.y };
      }).filter(Boolean) as { key: string; label: string; color: string; x: number; y: number }[];
      setPts(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, clusters, sigma]);
  if (!enabled) return null;
  return (
    <>
      {pts.map((p) => (
        <div key={p.key} style={{
          position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)", pointerEvents: "none",
          zIndex: 3, padding: "2px 9px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
          color: "#fff", background: p.color + "cc", border: `1px solid ${p.color}`, boxShadow: "0 2px 8px #0007",
        }}>{p.label}</div>
      ))}
    </>
  );
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

// Priority order for the "max nodes" performance cap — keep the structural nodes,
// drop commits first (they're the most numerous and least individually meaningful).
const CAP_RANK: Record<string, number> = { account: 0, repo: 1, branch: 2, workitem: 3, pr: 4, commit: 5 };
export function useCapHidden(data: GraphData | null, cap: number): Set<string> {
  return useMemo(() => {
    if (!data || cap >= data.nodes.length) return new Set<string>();
    const ranked = [...data.nodes].sort((a, b) => (CAP_RANK[a.attributes.nodeType] ?? 9) - (CAP_RANK[b.attributes.nodeType] ?? 9));
    return new Set(ranked.slice(cap).map((n) => n.key));
  }, [data, cap]);
}
