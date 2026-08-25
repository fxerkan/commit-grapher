import { Component, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  SigmaContainer, useLoadGraph, useRegisterEvents, useSetSettings, useSigma,
  ControlsContainer, ZoomControl, FullScreenControl,
} from "@react-sigma/core";
import "@react-sigma/core/lib/react-sigma.min.css";
import { EdgeArrowProgram, EdgeRectangleProgram } from "sigma/rendering";
import { NodePictogramProgram } from "@sigma/node-image";
import { api, Facets, GraphData } from "../api";
import FilterPanel, { FilterDim } from "../components/FilterPanel";
import GraphQLPane from "../components/GraphQLPane";
import { getSettings, physicsIterations, setSettings, useSettings } from "../settings";
import {
  AnimateControl, LayoutControl, LayoutKind, ClusterBy, ShapeControl, FitControl,
  nodeGroupColors, computeStats, useCapHidden,
} from "../graphExtras";
import { useT } from "../i18n";

const TYPES = ["account", "repo", "branch", "pr", "commit", "workitem"] as const;
type NodeType = (typeof TYPES)[number];
const TYPE_LABEL: Record<string, string> = { pr: "PR", workitem: "Work item" };
// Mirror backend graph.py COLORS so the legend swatches match the on-canvas node colors.
const TYPE_COLOR: Record<NodeType, string> = {
  account: "#f78166", repo: "#58a6ff", branch: "#3fb950", pr: "#bc8cff",
  commit: "#d29922", workitem: "#db61a2",
};

interface Filters {
  types: Set<NodeType>;
  search: string;
  branch: string;
  humanAI: "all" | "human" | "ai";
}

class ErrorBoundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: any) { return { err: String(e?.message || e) }; }
  render() {
    if (this.state.err)
      return <div style={{ padding: 40, color: "#f85149" }}>Graph error: {this.state.err}
        <button onClick={() => this.setState({ err: null })} style={{ marginLeft: 8 }}>retry</button></div>;
    return this.props.children;
  }
}

// Label with a halo/stroke so names stay readable over nodes/edges in either theme.
const mkDrawLabel = (textColor: string, halo: string) =>
  (ctx: CanvasRenderingContext2D, data: any, settings: any) => {
    if (!data.label) return;
    const size = settings.labelSize || 12;
    ctx.font = `${settings.labelWeight || "600"} ${size}px ${settings.labelFont || "sans-serif"}`;
    const x = data.x + data.size + 4, y = data.y + size / 3;
    ctx.lineJoin = "round"; ctx.lineWidth = 4; ctx.strokeStyle = halo; ctx.strokeText(data.label, x, y);
    ctx.fillStyle = textColor; ctx.fillText(data.label, x, y);
  };

function LoadGraph({ data, focus }: { data: GraphData; focus: number | null }) {
  const loadGraph = useLoadGraph();
  const sigma = useSigma();
  useEffect(() => {
    const g = new Graph();
    data.nodes.forEach((n) => g.addNode(n.key, { ...n.attributes }));
    data.edges.forEach((e) => {
      if (g.hasNode(e.source) && g.hasNode(e.target) && !g.hasEdge(e.source, e.target))
        g.addEdgeWithKey(e.key, e.source, e.target, {});
    });
    // Layout effort + spread come from Settings (auto-scaled down for huge graphs). Off = keep
    // the deterministic scatter positions (fast, no physics pass).
    const st = getSettings();
    const iterations = physicsIterations(st.physics, g.order);
    if (iterations > 0 && g.order > 1)
      forceAtlas2.assign(g, { iterations, settings: { gravity: st.gravity, scalingRatio: st.scaling } });
    loadGraph(g);
    // Camera fit (whole graph, or zoom-to-focus on drill-down) is handled by <FitControl>,
    // which waits for Sigma's coordinate extent to settle before framing.
  }, [data, loadGraph, sigma, focus]);
  return null;
}

// Dragging nodes (standard @react-sigma pattern). Works during continuous layout too —
// the worker reads live positions, so a dragged node just feeds back into the simulation.
function DragControl() {
  const sigma = useSigma();
  const reg = useRegisterEvents();
  const dragged = useRef<string | null>(null);
  useEffect(() => {
    reg({
      downNode: (e) => { dragged.current = e.node; sigma.getGraph().setNodeAttribute(e.node, "highlighted", true); },
      mousemovebody: (e) => {
        if (!dragged.current) return;
        const p = sigma.viewportToGraph(e);
        const g = sigma.getGraph();
        g.setNodeAttribute(dragged.current, "x", p.x);
        g.setNodeAttribute(dragged.current, "y", p.y);
        e.preventSigmaDefault(); e.original.preventDefault(); e.original.stopPropagation();
      },
      mouseup: () => {
        if (dragged.current) sigma.getGraph().removeNodeAttribute(dragged.current, "highlighted");
        dragged.current = null;
      },
      mousedown: () => { if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox()); },
    });
  }, [reg, sigma]);
  return null;
}

function Controller({ filters, branchSel, prSel, botSet, myNames, dataKey, focus, onFocus, showArrows, queryKeys, revealed, capHidden, groupColors, onHover, onStats }: {
  filters: Filters; branchSel: Set<string | number>; prSel: Set<string | number>;
  botSet: Set<string>; myNames: Set<string>; dataKey: string;
  focus: number | null; onFocus: (id: number | null) => void; showArrows: boolean;
  queryKeys: Set<string> | null; revealed: Set<string> | null; capHidden: Set<string>;
  groupColors: Map<string, string> | null;
  onHover: (info: { key: string; attrs: any; x: number; y: number } | null) => void;
  onStats: (v: { nodes: number; edges: number }) => void;
}) {
  const sigma = useSigma();
  const reg = useRegisterEvents();
  const setSettings = useSetSettings();
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => { setHovered(null); onHover(null); }, [dataKey]);

  useEffect(() => {
    reg({
      enterNode: (e) => {
        setHovered(e.node);
        const g = sigma.getGraph();
        if (!g.hasNode(e.node)) return;
        const a = g.getNodeAttributes(e.node);
        const vp = sigma.graphToViewport(a as any);
        onHover({ key: e.node, attrs: a, x: vp.x, y: vp.y });
      },
      leaveNode: () => { setHovered(null); onHover(null); },
      clickNode: (e) => {
        if (!e.node.startsWith("repo:")) return;
        const id = Number(e.node.slice(5));
        onFocus(focus === id ? null : id);  // click focused repo again -> unfocus
      },
      clickStage: () => { if (focus != null) onFocus(null); },  // click empty background -> unfocus
      doubleClickStage: (e) => { onFocus(null); e.preventSigmaDefault(); },
    });
  }, [reg, focus, onFocus]);

  useEffect(() => {
    const graph = sigma.getGraph();
    const q = filters.search.trim().toLowerCase();
    // key-aware so branch (by name) and PR (by id from the "pr:<id>" key) selections work
    const match = (node: string, data: any) => {
      if (capHidden.has(node)) return false;  // performance cap: node beyond the render limit
      if (queryKeys && !queryKeys.has(node)) return false;  // GraphQL result applied as a canvas filter
      if (!filters.types.has(data.nodeType)) return false;
      if (q && !(data.label || "").toLowerCase().includes(q)) return false;
      if (branchSel.size && data.nodeType === "branch" && !branchSel.has(data.label)) return false;
      if (prSel.size && data.nodeType === "pr" && !prSel.has(Number(node.slice(3)))) return false;
      if (data.nodeType === "commit" && filters.humanAI !== "all") {
        const isBot = botSet.has(data.author);
        if (filters.humanAI === "human" && isBot) return false;
        if (filters.humanAI === "ai" && !isBot) return false;
      }
      return true;
    };
    const hot = hovered && graph.hasNode(hovered) ? hovered : null;
    setSettings({
      nodeReducer: (node, data) => {
        if (revealed && !revealed.has(node)) return { ...data, hidden: true };  // intro: not yet revealed
        if (!match(node, data)) return { ...data, hidden: true };
        const mine = myNames.size && data.author && myNames.has(data.author);
        // Cluster-by recolors nodes by their group; "mine"/AI tints still win so they pop.
        const gcol = groupColors ? groupColors.get(node) : undefined;
        // AI-attributed commit nodes tint purple so agent activity pops on a focused repo.
        const color = mine ? "#f0c000" : (data.nodeType === "commit" && data.aiAgent ? "#bc8cff" : (gcol || data.color));
        const base = { ...data, color };
        if (hot) {
          if (node === hot) return { ...base, forceLabel: true, zIndex: 2, highlighted: true };
          if (graph.areNeighbors(hot, node)) return { ...base, forceLabel: true, zIndex: 1 };  // show neighbor names
          return { ...base, color: "#9aa2ab55", label: "", zIndex: 0 };
        }
        return base;
      },
      edgeReducer: (edge, data) => {
        const type = showArrows ? "arrow" : "line";
        const s = graph.source(edge), t = graph.target(edge);
        if (revealed && (!revealed.has(s) || !revealed.has(t))) return { ...data, hidden: true };  // intro
        if (!match(s, graph.getNodeAttributes(s)) || !match(t, graph.getNodeAttributes(t)))
          return { ...data, hidden: true };
        if (hot) return graph.hasExtremity(edge, hot)
          ? { ...data, type, color: "#1f6feb", size: 2, zIndex: 1 } : { ...data, hidden: true };
        return { ...data, type };
      },
    });
    // Live visible counts for the stats panel (single source of truth: the same match()).
    const vis = new Set<string>();
    graph.forEachNode((n, d) => { if (match(n, d)) vis.add(n); });
    let ve = 0;
    graph.forEachEdge((_e, _a, s, t) => { if (vis.has(s) && vis.has(t)) ve++; });
    onStats({ nodes: vis.size, edges: ve });
  }, [hovered, filters, branchSel, prSel, myNames, botSet, showArrows, queryKeys, revealed, capHidden, groupColors, sigma, setSettings, onStats]);
  return null;
}

// Reveal order for the intro animation: interleave accounts round-robin so several subtrees
// grow in parallel; within each account go repo → its branches/PRs/work items, repo by repo.
function revealOrder(data: GraphData): string[] {
  const children = new Map<string, string[]>();
  data.edges.forEach((e) => { const a = children.get(e.source) || []; a.push(e.target); children.set(e.source, a); });
  const typeOf = new Map(data.nodes.map((n) => [n.key, n.attributes.nodeType as string]));
  const seen = new Set<string>();
  const seqs: string[][] = [];
  for (const acc of data.nodes.filter((n) => n.attributes.nodeType === "account")) {
    const seq: string[] = [];
    const push = (k: string) => { if (!seen.has(k)) { seen.add(k); seq.push(k); } };
    push(acc.key);
    const kids = children.get(acc.key) || [];
    for (const repo of kids.filter((k) => typeOf.get(k) === "repo")) {
      push(repo);
      for (const c of children.get(repo) || []) push(c);   // branches, PRs, work items
    }
    for (const wi of kids.filter((k) => typeOf.get(k) === "workitem")) push(wi);  // Jira issues
    if (seq.length) seqs.push(seq);
  }
  // Round-robin across account sequences for the "parallel" feel.
  const order: string[] = [];
  for (let i = 0; seqs.some((s) => i < s.length); i++)
    for (const s of seqs) if (i < s.length) order.push(s[i]);
  data.nodes.forEach((n) => { if (!seen.has(n.key)) order.push(n.key); });  // any orphans last
  return order;
}

// --- sidebar control styling (for the graph-specific extras rendered inside FilterPanel) ---
const box: React.CSSProperties = { width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--fg)" };

// Floating hover card. Positioned at the node's viewport coords (relative to the graph container),
// showing the node's label, type and the aggregate stats the backend attached (commits/PRs/…).
function NodeTooltip({ info, t }: { info: { key: string; attrs: any; x: number; y: number }; t: (s: string) => string }) {
  const a = info.attrs;
  const type = a.nodeType as NodeType;
  const st = a.stats || {};
  const rows: [string, React.ReactNode][] = [];
  if (type === "account") rows.push(["Repos", st.repos ?? 0]);
  if (st.commits != null) rows.push(["Commits", (st.commits as number).toLocaleString()]);
  if (st.branches != null) rows.push(["Branches", st.branches]);
  if (st.prs != null) rows.push(["PRs", st.prs]);
  if (type === "commit") {
    if (a.author) rows.push(["Author", a.author]);
    if (a.aiAgent) rows.push(["AI Agent", a.aiAgent]);
  }
  return (
    <div style={{
      position: "absolute", left: info.x + 14, top: info.y + 14, zIndex: 10, pointerEvents: "none",
      maxWidth: 300, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8,
      boxShadow: "0 8px 24px #0009", padding: "8px 10px", fontSize: 12, color: "var(--fg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: rows.length ? 6 : 0 }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: TYPE_COLOR[type], flex: "0 0 auto" }} />
        <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</b>
        <span style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", flex: "0 0 auto" }}>{t(TYPE_LABEL[type] || type)}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, lineHeight: 1.6 }}>
          <span style={{ color: "var(--muted)" }}>{t(k)}</span><b style={{ fontVariantNumeric: "tabular-nums" }}>{v}</b>
        </div>
      ))}
    </div>
  );
}

export default function GraphView() {
  const t = useT();
  const s = useSettings();  // live: nodeShapes, gravity, scaling
  const [facets, setFacets] = useState<Facets | null>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(280);
  const [onlyMine, setOnlyMine] = useState(() => getSettings().defaultOnlyMine);
  const [showArrows, setShowArrows] = useState(() => getSettings().showArrows);
  const [myNamesStr, setMyNamesStr] = useState(() => getSettings().myNames);
  // Power-tool state: continuous layout, layout kind, clustering, performance cap, live counts.
  const [animating, setAnimating] = useState(false);
  const [layout, setLayout] = useState<LayoutKind>("forceatlas2");
  const [clusterBy, setClusterBy] = useState<ClusterBy>("none");
  const [nodeCap, setNodeCap] = useState(100000);
  const [vis, setVis] = useState({ nodes: 0, edges: 0 });
  const [refit, setRefit] = useState(0);  // bump to re-fit the camera (new data, intro end, layout change)
  const containerRef = useRef<HTMLDivElement>(null);

  // server-side filters
  const [provider, setProvider] = useState<Set<string | number>>(
    () => { const p = getSettings().defaultProvider; return new Set(p ? [p] : []); });
  const [organizations, setOrganizations] = useState<Set<string | number>>(new Set());
  const [accountIds, setAccountIds] = useState<Set<string | number>>(new Set());
  const [projects, setProjects] = useState<Set<string | number>>(new Set());
  const [repos, setRepos] = useState<Set<string | number>>(new Set());
  const [authors, setAuthors] = useState<Set<string | number>>(new Set());
  const [languages, setLanguages] = useState<Set<string | number>>(new Set());
  const [libraries, setLibraries] = useState<Set<string | number>>(new Set());
  const [aiAgents, setAiAgents] = useState<Set<string | number>>(new Set());
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [hover, setHover] = useState<{ key: string; attrs: any; x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState<Set<string> | null>(null);  // intro reveal gate (null = all shown)
  const introRan = useRef(false);
  // client-side filters (branch/PR selections + node types/search/human-AI)
  const [branchSel, setBranchSel] = useState<Set<string | number>>(new Set());
  const [prSel, setPrSel] = useState<Set<string | number>>(new Set());
  const [filters, setFilters] = useState<Filters>(
    () => { const st = getSettings(); return { types: new Set(st.defaultNodeTypes as NodeType[]), search: "", branch: "", humanAI: st.defaultHumanAI }; });
  const [queryKeys, setQueryKeys] = useState<Set<string> | null>(null);  // node keys from a GraphQL query, applied to the canvas

  // Cascading facets: org → workspace → repo → branch/PR/author all narrow to the selection.
  useEffect(() => {
    api.facets({
      provider: ([...provider][0] as string) || undefined,
      organizations: organizations.size ? [...organizations].map(String) : undefined,
      account_ids: accountIds.size ? [...accountIds].map(Number) : undefined,
      projects: projects.size ? [...projects].map(String) : undefined,
      repo_ids: repos.size ? [...repos].map(Number) : undefined,
    }).then(setFacets).catch(() => {});
  }, [JSON.stringify([...provider]), JSON.stringify([...organizations]), JSON.stringify([...accountIds]), JSON.stringify([...projects]), JSON.stringify([...repos])]);

  const providerStr = provider.size === 1 ? ([...provider][0] as string) : undefined;  // 1 = filter, 0/all = no filter
  const myNames = useMemo(() => {
    const fromAccounts = facets?.account_names || [];
    const extra = myNamesStr.split(",").map((s) => s.trim()).filter(Boolean);
    return new Set([...fromAccounts, ...extra]);
  }, [facets, myNamesStr]);

  const effectiveAuthors = useMemo(() => {
    const a = new Set([...authors].map(String));
    if (onlyMine) myNames.forEach((n) => a.add(n));
    return [...a];
  }, [authors, onlyMine, myNames]);

  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    // Keep the current graph on screen while fetching the new one (no blank flash),
    // and only refetch when a SERVER-side filter actually changes.
    setUpdating(true);
    api.graph({
      provider: providerStr || undefined,
      repo_id: focus ?? undefined,
      authors: effectiveAuthors.length ? effectiveAuthors : undefined,
      repo_ids: repos.size ? [...repos].map(Number) : undefined,
      projects: projects.size ? [...projects].map(String) : undefined,
      organizations: organizations.size ? [...organizations].map(String) : undefined,
      account_ids: accountIds.size ? [...accountIds].map(Number) : undefined,
      languages: languages.size ? [...languages].map(String) : undefined,
      libraries: libraries.size ? [...libraries].map(String) : undefined,
      ai_agents: aiAgents.size ? [...aiAgents].map(String) : undefined,
      start: start || undefined, end: end || undefined,
    }).then((d) => { setData(d); setErr(null); }).catch((e) => setErr(e.message)).finally(() => setUpdating(false));
  }, [providerStr, focus, JSON.stringify(effectiveAuthors), JSON.stringify([...repos]), JSON.stringify([...projects]), JSON.stringify([...organizations]), JSON.stringify([...accountIds]), JSON.stringify([...languages]), JSON.stringify([...libraries]), JSON.stringify([...aiAgents]), start, end]);

  // Intro: on the FIRST full-graph load (no focus), reveal nodes step by step, several
  // account subtrees growing in parallel. Runs once per mount; Settings toggles it + its duration.
  useEffect(() => {
    if (!data || introRan.current) return;
    introRan.current = true;
    const st = getSettings();
    // Skip on tiny graphs (nothing to stage) and on truly massive ones (re-rendering the whole
    // WebGL scene ~12×/s would freeze the tab). ponytail: 4000 is a heuristic; the user can also
    // turn the intro off or shorten it in Settings.
    if (!st.introAnimation || focus != null || data.nodes.length < 4 || data.nodes.length > 4000) { setRevealed(null); return; }
    const order = revealOrder(data);
    const fps = 12, ticks = Math.max(1, Math.round((st.introSeconds || 6) * fps));
    const per = Math.ceil(order.length / ticks);
    const set = new Set<string>();
    setRevealed(new Set());
    let idx = 0;
    const iv = setInterval(() => {
      for (let k = 0; k < per && idx < order.length; k++, idx++) set.add(order[idx]);
      setRevealed(new Set(set));
      if (idx >= order.length) { clearInterval(iv); setTimeout(() => { setRevealed(null); setRefit((r) => r + 1); }, 150); }
    }, 1000 / fps);
    return () => clearInterval(iv);
  }, [data, focus]);

  const botSet = useMemo(() => new Set((facets?.authors || []).filter((a) => a.bot).map((a) => a.name)), [facets]);
  const dataKey = `${providerStr}|${focus}|${[...repos]}|${[...projects]}|${[...organizations]}|${[...accountIds]}|${effectiveAuthors}|${[...languages]}|${[...libraries]}|${[...aiAgents]}|${start}|${end}`;
  const theme = document.documentElement.dataset.theme || "dark";
  const textColor = theme === "light" ? "#1f2328" : "#e6edf3";
  const halo = theme === "light" ? "#ffffffcc" : "#0d1117cc";
  const edgeColor = theme === "light" ? "#c2c8d0" : "#3a4048";
  // CRITICAL for perf: a stable settings object, else react-sigma rebuilds the whole
  // WebGL instance + re-runs layout on every render (e.g. opening a dropdown).
  const sigmaSettings = useMemo(() => ({
    labelColor: { color: textColor }, defaultEdgeColor: edgeColor, renderEdgeLabels: false,
    defaultDrawNodeLabel: mkDrawLabel(textColor, halo), defaultDrawNodeHover: mkDrawLabel(textColor, halo),
    labelWeight: "600", zIndex: true,
    labelRenderedSizeThreshold: getSettings().labelDensity,  // Settings: lower = more labels (picked up on remount)
    edgeProgramClasses: { line: EdgeRectangleProgram, arrow: EdgeArrowProgram },
    nodeProgramClasses: { pictogram: NodePictogramProgram },  // distinct shapes per node type
  }), [textColor, halo, edgeColor]);

  const activeCount = provider.size + organizations.size + accountIds.size + projects.size + repos.size
    + authors.size + languages.size + libraries.size + aiAgents.size + branchSel.size + prSel.size
    + (filters.search ? 1 : 0) + (filters.humanAI !== "all" ? 1 : 0)
    + (filters.types.size !== TYPES.length ? 1 : 0) + (onlyMine ? 1 : 0) + (focus != null ? 1 : 0)
    + (queryKeys ? 1 : 0);

  const resetAll = () => {
    const st = getSettings();
    setProvider(new Set(st.defaultProvider ? [st.defaultProvider] : [])); setOrganizations(new Set()); setAccountIds(new Set());
    setProjects(new Set()); setRepos(new Set()); setAuthors(new Set());
    setLanguages(new Set()); setLibraries(new Set()); setAiAgents(new Set());
    setBranchSel(new Set()); setPrSel(new Set()); setFocus(null); setOnlyMine(st.defaultOnlyMine);
    setFilters({ types: new Set(st.defaultNodeTypes as NodeType[]), search: "", branch: "", humanAI: st.defaultHumanAI });
    setQueryKeys(null);
  };
  const applyQuery = (keys: string[] | null) => setQueryKeys(keys && keys.length ? new Set(keys) : null);
  const canvasKeys = useMemo(() => new Set((data?.nodes || []).map((n) => n.key)), [data]);
  const capHidden = useCapHidden(data, nodeCap);
  const groupColors = useMemo(() => nodeGroupColors(data, clusterBy), [data, clusterBy]);
  const stats = computeStats({ nodes: data?.nodes.length || 0, edges: data?.edges.length || 0 }, vis);
  const onStats = useMemo(() => (v: { nodes: number; edges: number }) => setVis(v), []);
  // Re-fit the camera once a freshly loaded / drilled-in graph has painted. `facets` is in the
  // deps because it lands after the graph and re-triggers the Controller's setSettings (which
  // re-frames Sigma) — so we must re-fit once it settles.
  useEffect(() => { if (data) setRefit((r) => r + 1); }, [data, focus, facets]);

  const providerOpts = (facets?.providers || []).map((p) => ({ key: p, label: p }));
  const orgOpts = (facets?.organizations || []).filter((o) => !providerStr || o.provider === providerStr).map((o) => ({ key: o.name, label: o.name }));
  const accountOpts = (facets?.accounts || []).map((a) => ({ key: a.id, label: `${a.display_name} (${a.provider})` }));
  const projectOpts = (facets?.projects || []).filter((p) => !providerStr || p.provider === providerStr).map((p) => ({ key: p.name, label: p.name }));
  // Repo dropdown shows just the repo name (workspace already lives in its own filter).
  const repoOpts = (facets?.repos || []).map((r) => ({ key: r.id, label: r.repo }));
  const branchOpts = (facets?.branches || []).map((b) => ({ key: b.name, label: b.name, count: b.count }));
  const prOpts = (facets?.prs || []).map((p) => ({ key: p.id, label: `#${p.number} ${p.title || ""}`.trim() }));
  const authorOpts = (facets?.authors || []).map((a) => ({
    key: a.name, label: a.name, count: a.count,
    badge: a.bot ? "AI" : undefined, badgeColor: "#8957e5",
  }));
  const langOpts = (facets?.languages || []).map((l) => ({ key: l.name, label: l.name, count: l.count }));
  const libOpts = (facets?.libraries || []).map((l) => ({ key: l.name, label: l.name, count: l.count }));
  const aiOpts = (facets?.ai_agents || []).map((a) => ({ key: a.name, label: a.name, count: a.count, badge: "AI", badgeColor: "#8957e5" }));

  const dims: FilterDim[] = [
    { key: "provider", label: "Provider", options: providerOpts, selected: provider, placeholder: "All providers",
      onChange: (s) => { setProvider(s); setOrganizations(new Set()); setProjects(new Set()); setRepos(new Set()); } },
    { key: "account", label: "Account", options: accountOpts, selected: accountIds, placeholder: "All accounts",
      onChange: (s) => { setAccountIds(s); setOrganizations(new Set()); setProjects(new Set()); setRepos(new Set()); } },
    { key: "org", label: "Organization", options: orgOpts, selected: organizations, placeholder: "All organizations",
      onChange: (s) => { setOrganizations(s); setProjects(new Set()); setRepos(new Set()); } },
    { key: "project", label: "Workspace", options: projectOpts, selected: projects, placeholder: "All workspaces",
      onChange: (s) => { setProjects(s); setRepos(new Set()); } },
    { key: "repo", label: "Repository", options: repoOpts, selected: repos, placeholder: "All repositories", onChange: setRepos },
    { key: "branch", label: "Branch", options: branchOpts, selected: branchSel, placeholder: "All branches", onChange: setBranchSel },
    { key: "pr", label: "Pull request", options: prOpts, selected: prSel, placeholder: "All PRs", onChange: setPrSel },
    { key: "author", label: "Author", options: authorOpts, selected: authors, placeholder: "All authors", onChange: setAuthors },
    { key: "lang", label: "Language", options: langOpts, selected: languages, placeholder: "All languages", onChange: setLanguages },
    { key: "lib", label: "Library / Framework", options: libOpts, selected: libraries, placeholder: "All libraries", onChange: setLibraries },
    { key: "ai", label: "AI Agent", options: aiOpts, selected: aiAgents, placeholder: "All agents", onChange: setAiAgents },
  ];

  // Graph-specific controls that don't exist on other pages.
  const extra = (
    <>
      <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg)", fontSize: 13 }}>
        <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> {t("Only my activity")}
      </label>
      {onlyMine && (
        <input style={box} placeholder={t("my names, comma-separated")} value={myNamesStr}
          onChange={(e) => { setMyNamesStr(e.target.value); setSettings({ myNames: e.target.value }); }} />
      )}
      <div>
        <div className="field-label">{t("Contributors")}</div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "human", "ai"] as const).map((k) => (
            <button key={k} onClick={() => setFilters((f) => ({ ...f, humanAI: k }))}
              className={filters.humanAI === k ? "btn btn-active" : "btn"}>{k === "ai" ? t("AI") : t(k === "all" ? "All" : "Human")}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="field-label">{t("Search any node")}</div>
        <input style={box} placeholder={t("repo / PR / commit…")} value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
      </div>
      <div>
        <div className="field-label">{t("Node types")}</div>
        {TYPES.map((nt) => (
          <label key={nt} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg)", padding: "2px 0", textTransform: "capitalize", fontSize: 13 }}>
            <input type="checkbox" checked={filters.types.has(nt)} onChange={() => setFilters((f) => { const s = new Set(f.types); s.has(nt) ? s.delete(nt) : s.add(nt); return { ...f, types: s }; })} />
            <span style={{ width: 11, height: 11, borderRadius: 3, background: TYPE_COLOR[nt], flex: "0 0 auto", boxShadow: "0 0 0 1px rgba(0,0,0,.25) inset" }} /> {t(TYPE_LABEL[nt] || nt)}
          </label>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0 0", color: "var(--fg)", fontSize: 13 }}>
          <input type="checkbox" checked={showArrows} onChange={(e) => setShowArrows(e.target.checked)} /> {t("Show relationship arrows")}
        </label>
      </div>
      <div>
        <div className="field-label">{t("Layout")}</div>
        <select style={box} value={layout} onChange={(e) => setLayout(e.target.value as LayoutKind)}>
          <option value="forceatlas2">{t("Force-directed")}</option>
          <option value="circular">{t("Circular")}</option>
          <option value="grid">{t("Grid")}</option>
          <option value="random">{t("Random")}</option>
        </select>
      </div>
      <div>
        <div className="field-label">{t("Cluster by")}</div>
        <select style={box} value={clusterBy} onChange={(e) => setClusterBy(e.target.value as ClusterBy)}>
          <option value="none">{t("None")}</option>
          <option value="account">{t("Account")}</option>
          <option value="org">{t("Organization")}</option>
          <option value="workspace">{t("Workspace")}</option>
          <option value="repo">{t("Repository")}</option>
        </select>
      </div>
    </>
  );

  const total = data?.nodes.length || 0;
  const statRow = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, lineHeight: 1.7 }}>
      <span style={{ color: "var(--muted)" }}>{t(label)}</span>
      <b style={{ fontVariantNumeric: "tabular-nums" }}>{value}</b>
    </div>
  );
  const footer = (
    <>
      <button className={activeCount ? "btn btn-accent2" : "btn"} style={{ marginTop: 4 }} onClick={resetAll}>
        {t("Reset filters")} {activeCount > 0 && `(${activeCount})`}
      </button>

      {/* Performance cap — trims the graph (commits first) to keep big datasets smooth. */}
      <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <div className="field-label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{t("Max nodes rendered")}</span>
          <b style={{ color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>{Math.min(nodeCap, total).toLocaleString()}</b>
        </div>
        <input type="range" style={{ width: "100%" }} min={Math.min(50, total)} max={Math.max(50, total)} step={10}
          value={Math.min(nodeCap, total)} onChange={(e) => setNodeCap(Number(e.target.value))} disabled={total < 50} />
        <div style={{ color: "var(--muted)", fontSize: 11 }}>{t("Lower to boost performance on huge graphs.")}</div>
      </div>

      {/* Graph statistics — live counts, density and average degree. */}
      <div style={{ marginTop: 12, fontSize: 12 }}>
        <div className="field-label">{t("Graph statistics")}</div>
        {statRow("Total nodes", total.toLocaleString())}
        {statRow("Total edges", stats.totalEdges.toLocaleString())}
        {statRow("Visible nodes", stats.visibleNodes.toLocaleString())}
        {statRow("Visible edges", stats.visibleEdges.toLocaleString())}
        {statRow("Relations", stats.visibleEdges.toLocaleString())}
        {statRow("Density", `${(stats.density * 100).toFixed(3)}%`)}
        {statRow("Avg degree", stats.avgDegree.toFixed(1))}
      </div>

      <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 11 }}>
        {t("Drag nodes · scroll to zoom · click a repo to focus")}
      </div>
    </>
  );

  if (err) return <div style={{ padding: 40, color: "#f85149" }}>Error: {err}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <GraphQLPane provider={providerStr} repoId={focus ?? undefined} nodeKeys={canvasKeys}
        onApply={applyQuery} applied={queryKeys != null} />
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden", gap: 12, padding: 12 }}>
        <FilterPanel dims={dims} open={open} onOpenChange={setOpen} activeCount={activeCount}
          extra={extra} footer={footer} width={width} onWidthChange={setWidth}
          dateRange={{ start, end, setStart, setEnd }} />

        <div ref={containerRef} style={{ flex: 1, minWidth: 0, overflow: "hidden", position: "relative" }}>
          {updating && <div style={{ position: "absolute", top: 10, right: 14, zIndex: 5, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", fontSize: 12, color: "var(--muted)" }}>{t("updating…")}</div>}
          {!data ? (
            <div className="cg-loader"><div className="ring" /><div>{t("Loading graph…")}</div></div>
          ) : data.nodes.length === 0 ? (
            <div style={{ padding: 40 }}>{t("No nodes match these filters.")}</div>
          ) : (
            <ErrorBoundary>
              <SigmaContainer key={theme} style={{ height: "100%", background: "var(--bg)" }} settings={sigmaSettings}>
                <LoadGraph data={data} focus={focus} />
                <DragControl />
                <ShapeControl on={s.nodeShapes} dataKey={dataKey} />
                <LayoutControl layout={layout} gravity={s.gravity} scaling={s.scaling} onApplied={() => setRefit((r) => r + 1)} />
                <AnimateControl running={animating} gravity={s.gravity} scaling={s.scaling} />
                <FitControl trigger={refit} focus={focus} />
                <Controller filters={filters} branchSel={branchSel} prSel={prSel} botSet={botSet} myNames={myNames} dataKey={dataKey} focus={focus} onFocus={setFocus} showArrows={showArrows} queryKeys={queryKeys} revealed={revealed} capHidden={capHidden} groupColors={groupColors} onHover={setHover} onStats={onStats} />
                <ControlsContainer position="bottom-right">
                  <ZoomControl />
                  <FullScreenControl container={containerRef} />
                  <div className="react-sigma-control">
                    <button type="button" title={t(animating ? "Stop layout animation" : "Start layout animation")}
                      onClick={() => setAnimating((a) => !a)}>{animating ? "⏸" : "▶"}</button>
                  </div>
                </ControlsContainer>
              </SigmaContainer>
              {hover && <NodeTooltip info={hover} t={t} />}
            </ErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
}
