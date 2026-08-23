import { Component, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  SigmaContainer, useLoadGraph, useRegisterEvents, useSetSettings, useSigma,
} from "@react-sigma/core";
import "@react-sigma/core/lib/react-sigma.min.css";
import { EdgeArrowProgram, EdgeRectangleProgram } from "sigma/rendering";
import { api, Facets, GraphData } from "../api";
import FilterPanel, { FilterDim } from "../components/FilterPanel";
import GraphQLPane from "../components/GraphQLPane";
import { getSettings, physicsIterations, setSettings } from "../settings";

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

function LoadGraph({ data }: { data: GraphData }) {
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
    setTimeout(() => sigma.getCamera().animatedReset({ duration: 400 }), 60);  // fit to the loaded set
  }, [data, loadGraph, sigma]);
  return null;
}

// Dragging nodes (standard @react-sigma pattern).
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

function Controller({ filters, branchSel, prSel, botSet, myNames, dataKey, focus, onFocus, showArrows, queryKeys }: {
  filters: Filters; branchSel: Set<string | number>; prSel: Set<string | number>;
  botSet: Set<string>; myNames: Set<string>; dataKey: string;
  focus: number | null; onFocus: (id: number | null) => void; showArrows: boolean;
  queryKeys: Set<string> | null;
}) {
  const sigma = useSigma();
  const reg = useRegisterEvents();
  const setSettings = useSetSettings();
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => { setHovered(null); }, [dataKey]);

  useEffect(() => {
    reg({
      enterNode: (e) => setHovered(e.node),
      leaveNode: () => setHovered(null),
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
        if (!match(node, data)) return { ...data, hidden: true };
        const mine = myNames.size && data.author && myNames.has(data.author);
        // AI-attributed commit nodes tint purple so agent activity pops on a focused repo.
        const color = mine ? "#f0c000" : (data.nodeType === "commit" && data.aiAgent ? "#bc8cff" : data.color);
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
        if (!match(s, graph.getNodeAttributes(s)) || !match(t, graph.getNodeAttributes(t)))
          return { ...data, hidden: true };
        if (hot) return graph.hasExtremity(edge, hot)
          ? { ...data, type, color: "#1f6feb", size: 2, zIndex: 1 } : { ...data, hidden: true };
        return { ...data, type };
      },
    });
  }, [hovered, filters, branchSel, prSel, myNames, botSet, showArrows, queryKeys, sigma, setSettings]);
  return null;
}

// --- sidebar control styling (for the graph-specific extras rendered inside FilterPanel) ---
const box: React.CSSProperties = { width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--fg)" };

export default function GraphView() {
  const [facets, setFacets] = useState<Facets | null>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(280);
  const [onlyMine, setOnlyMine] = useState(() => getSettings().defaultOnlyMine);
  const [showArrows, setShowArrows] = useState(() => getSettings().showArrows);
  const [myNamesStr, setMyNamesStr] = useState(() => getSettings().myNames);

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
    }).then((d) => { setData(d); setErr(null); }).catch((e) => setErr(e.message)).finally(() => setUpdating(false));
  }, [providerStr, focus, JSON.stringify(effectiveAuthors), JSON.stringify([...repos]), JSON.stringify([...projects]), JSON.stringify([...organizations]), JSON.stringify([...accountIds]), JSON.stringify([...languages]), JSON.stringify([...libraries]), JSON.stringify([...aiAgents])]);

  const botSet = useMemo(() => new Set((facets?.authors || []).filter((a) => a.bot).map((a) => a.name)), [facets]);
  const dataKey = `${providerStr}|${focus}|${[...repos]}|${[...projects]}|${[...organizations]}|${[...accountIds]}|${effectiveAuthors}|${[...languages]}|${[...libraries]}|${[...aiAgents]}`;
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
        <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Only my activity
      </label>
      {onlyMine && (
        <input style={box} placeholder="my names, comma-separated" value={myNamesStr}
          onChange={(e) => { setMyNamesStr(e.target.value); setSettings({ myNames: e.target.value }); }} />
      )}
      <div>
        <div className="field-label">Contributors</div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "human", "ai"] as const).map((k) => (
            <button key={k} onClick={() => setFilters((f) => ({ ...f, humanAI: k }))}
              className={filters.humanAI === k ? "btn btn-active" : "btn"}>{k === "ai" ? "AI" : k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="field-label">Search any node</div>
        <input style={box} placeholder="repo / PR / commit…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
      </div>
      <div>
        <div className="field-label">Node types</div>
        {TYPES.map((t) => (
          <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg)", padding: "2px 0", textTransform: "capitalize", fontSize: 13 }}>
            <input type="checkbox" checked={filters.types.has(t)} onChange={() => setFilters((f) => { const s = new Set(f.types); s.has(t) ? s.delete(t) : s.add(t); return { ...f, types: s }; })} />
            <span style={{ width: 11, height: 11, borderRadius: 3, background: TYPE_COLOR[t], flex: "0 0 auto", boxShadow: "0 0 0 1px rgba(0,0,0,.25) inset" }} /> {TYPE_LABEL[t] || t}
          </label>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 0 0", color: "var(--fg)", fontSize: 13 }}>
          <input type="checkbox" checked={showArrows} onChange={(e) => setShowArrows(e.target.checked)} /> Show relationship arrows
        </label>
      </div>
    </>
  );

  const footer = (
    <>
      <button className={activeCount ? "btn btn-accent2" : "btn"} style={{ marginTop: 4 }} onClick={resetAll}>
        Reset filters {activeCount > 0 && `(${activeCount})`}
      </button>
      <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 11 }}>
        {data ? `${data.nodes.length} nodes · ${data.edges.length} edges` : "…"}<br />
        Drag nodes · scroll to zoom · click a repo to focus, click again / background to reset.
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
          extra={extra} footer={footer} width={width} onWidthChange={setWidth} />

        <div style={{ flex: 1, minWidth: 0, overflow: "hidden", position: "relative" }}>
          {updating && <div style={{ position: "absolute", top: 10, right: 14, zIndex: 5, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 10px", fontSize: 12, color: "var(--muted)" }}>updating…</div>}
          {!data ? (
            <div style={{ padding: 40 }}>Loading graph…</div>
          ) : data.nodes.length === 0 ? (
            <div style={{ padding: 40 }}>No nodes match these filters.</div>
          ) : (
            <ErrorBoundary>
              <SigmaContainer key={theme} style={{ height: "100%", background: "var(--bg)" }} settings={sigmaSettings}>
                <LoadGraph data={data} />
                <DragControl />
                <Controller filters={filters} branchSel={branchSel} prSel={prSel} botSet={botSet} myNames={myNames} dataKey={dataKey} focus={focus} onFocus={setFocus} showArrows={showArrows} queryKeys={queryKeys} />
              </SigmaContainer>
            </ErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
}
