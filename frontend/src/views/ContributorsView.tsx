import { useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from "@react-sigma/core";
import "@react-sigma/core/lib/react-sigma.min.css";
import { NodeImageProgram } from "@sigma/node-image";
import * as echarts from "echarts";
import { api, ContributorGraph, ContributorDetail, ContributorNode, Facets } from "../api";
import { Opt } from "../components/MultiSelect";
import FilterPanel, { FilterDim } from "../components/FilterPanel";
import LanguagesBar from "../components/LanguagesBar";

const S = (arr: Iterable<any>) => new Set(arr);
const dicebear = (seed: string) => `https://api.dicebear.com/9.x/identicon/png?seed=${encodeURIComponent(seed || "?")}`;
const avatarUrl = (seed: string, avatar: string | null | undefined) => avatar || dicebear(seed);
const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n ?? 0));

// One reusable ECharts canvas (mirrors StatsView).
function EChart({ option, height = 260 }: { option: any; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const theme = document.documentElement.dataset.theme || "dark";
    const chart = echarts.init(ref.current, theme === "light" ? undefined : "dark");
    chart.setOption({ backgroundColor: "transparent", ...option });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); chart.dispose(); };
  }, [option]);
  return <div ref={ref} style={{ width: "100%", height }} />;
}

// Tiny inline SVG sparkline (last ~26 weeks) — cheaper than an ECharts instance per card.
function Spark({ data }: { data: { week: string; commits: number }[] }) {
  const d = data.slice(-26);
  const max = Math.max(1, ...d.map((x) => x.commits));
  const W = 4, G = 1, H = 34;
  return (
    <svg width={d.length * (W + G)} height={H} style={{ display: "block" }}>
      {d.map((x, i) => {
        const bh = Math.max(x.commits ? 2 : 0, Math.round((x.commits / max) * H));
        return <rect key={i} x={i * (W + G)} y={H - bh} width={W} height={bh} rx={1} fill="#2f81f7" />;
      })}
    </svg>
  );
}

// The avatar network (Sigma + node-image program).
function LoadContribGraph({ data }: { data: ContributorGraph }) {
  const loadGraph = useLoadGraph();
  const sigma = useSigma();
  useEffect(() => {
    const g = new Graph();
    data.nodes.forEach((n) => g.addNode(n.key, {
      ...n.attributes, type: "image", image: avatarUrl(n.key, n.attributes.avatar),
    }));
    data.edges.forEach((e) => {
      if (g.hasNode(e.source) && g.hasNode(e.target) && !g.hasEdge(e.source, e.target))
        g.addEdgeWithKey(e.key, e.source, e.target, {});
    });
    if (g.order > 1) forceAtlas2.assign(g, { iterations: g.order > 1500 ? 90 : 220, settings: { gravity: 1, scalingRatio: 30 } });
    loadGraph(g);
    setTimeout(() => sigma.getCamera().animatedReset({ duration: 400 }), 60);
  }, [data, loadGraph, sigma]);
  return null;
}
function ClickControl({ onPick }: { onPick: (login: string) => void }) {
  const reg = useRegisterEvents();
  useEffect(() => { reg({ clickNode: (e) => onPick(e.node) }); }, [reg, onPick]);
  return null;
}

function ContribCard({ c, rank, focused, onClick }: { c: ContributorNode & { weekly?: { week: string; commits: number }[] }; rank: number; focused: boolean; onClick: () => void }) {
  return (
    <div className="card" onClick={onClick} style={{ cursor: "pointer", outline: focused ? "2px solid var(--accent)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <img src={avatarUrl(c.login, c.avatar)} width={40} height={40} style={{ borderRadius: "50%" }} alt={c.login} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || c.login}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {c.commits.toLocaleString()} commits
            {(c.additions > 0 || c.deletions > 0) && <>
              {" · "}<span style={{ color: "#3fb950" }}>{fmt(c.additions)}++</span>{" "}
              <span style={{ color: "#f85149" }}>{fmt(c.deletions)}--</span>
            </>}
          </div>
        </div>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 10, padding: "1px 7px" }}>#{rank}</span>
      </div>
      {c.weekly && c.weekly.length > 0 && <Spark data={c.weekly} />}
    </div>
  );
}

export default function ContributorsView() {
  const [facets, setFacets] = useState<Facets | null>(null);
  const [graph, setGraph] = useState<ContributorGraph | null>(null);
  const [detail, setDetail] = useState<ContributorDetail | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Filters (same dims as the other pages; language/library fold into repo scope).
  const [providers, setProviders] = useState<Set<any>>(S([]));
  const [orgs, setOrgs] = useState<Set<any>>(S([]));
  const [projects, setProjects] = useState<Set<any>>(S([]));
  const [accounts, setAccounts] = useState<Set<any>>(S([]));
  const [repos, setRepos] = useState<Set<any>>(S([]));
  const [languages, setLanguages] = useState<Set<any>>(S([]));
  const [libraries, setLibraries] = useState<Set<any>>(S([]));
  const [aiAgents, setAiAgents] = useState<Set<any>>(S([]));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const fkey = JSON.stringify([[...providers], [...orgs], [...projects], [...accounts], [...repos]]);
  useEffect(() => {
    api.facets({
      provider: providers.size === 1 ? String([...providers][0]) : undefined,
      organizations: orgs.size ? [...orgs].map(String) : undefined,
      projects: projects.size ? [...projects].map(String) : undefined,
      account_ids: accounts.size ? [...accounts].map(Number) : undefined,
      repo_ids: repos.size ? [...repos].map(Number) : undefined,
    }).then(setFacets).catch(() => {});
  }, [fkey]);

  const repoDimActive = providers.size || orgs.size || projects.size || accounts.size || repos.size || languages.size || libraries.size;
  const effRepos = useMemo(() => (facets?.repos || []).filter((r) =>
    (!providers.size || providers.has(r.provider)) &&
    (!orgs.size || orgs.has(r.organization)) &&
    (!projects.size || projects.has(r.project)) &&
    (!accounts.size || accounts.has(r.account_id)) &&
    (!repos.size || repos.has(r.id)) &&
    (!languages.size || (r.languages || []).some((l) => languages.has(l))) &&
    (!libraries.size || (r.libraries || []).some((l) => libraries.has(l)))
  ), [facets, providers, orgs, projects, accounts, repos, languages, libraries]);
  const repoIds = repoDimActive ? (effRepos.length ? effRepos.map((r) => r.id) : [-1]) : undefined;
  const aiList = aiAgents.size ? [...aiAgents].map(String) : undefined;
  const qkey = JSON.stringify([repoIds, [...aiAgents].sort(), start, end]);

  useEffect(() => {
    api.contributors({ repo_ids: repoIds, ai_agents: aiList, start: start || undefined, end: end || undefined })
      .then((g) => { setGraph(g); setErr(null); }).catch((e) => setErr(e.message));
  }, [qkey]);

  useEffect(() => {
    setDetail(null);
    api.contributorDetail({ login: focus || undefined, repo_ids: repoIds, ai_agents: aiList, start: start || undefined, end: end || undefined })
      .then(setDetail).catch(() => setDetail(null));
  }, [focus, qkey]);

  // Option lists + dims (mirrors StatsView).
  const provOpts: Opt[] = (facets?.providers || []).map((p) => ({ key: p, label: p }));
  const orgOpts: Opt[] = (facets?.organizations || []).map((o) => ({ key: o.name, label: o.name, badge: o.provider }));
  const projOpts: Opt[] = (facets?.projects || []).map((p) => ({ key: p.name, label: p.name, badge: p.provider }));
  const accOpts: Opt[] = (facets?.accounts || []).map((a) => ({ key: a.id, label: a.display_name, badge: a.provider }));
  const scopedRepos = (facets?.repos || []).filter((r) =>
    (!providers.size || providers.has(r.provider)) &&
    (!orgs.size || orgs.has(r.organization)) &&
    (!projects.size || projects.has(r.project)) &&
    (!accounts.size || accounts.has(r.account_id)));
  const repoOpts: Opt[] = scopedRepos.map((r) => ({ key: r.id, label: r.full_name, badge: r.provider }));
  const langOpts: Opt[] = (facets?.languages || []).map((l) => ({ key: l.name, label: l.name, count: l.count }));
  const libOpts: Opt[] = (facets?.libraries || []).map((l) => ({ key: l.name, label: l.name, count: l.count }));
  const aiOpts: Opt[] = (facets?.ai_agents || []).map((a) => ({ key: a.name, label: a.name, count: a.count, badge: "AI", badgeColor: "#6e40c9" }));

  const del = (set: Set<any>, setter: (s: Set<any>) => void, k: any) => { const n = new Set(set); n.delete(k); setter(n); };
  const repoName = (id: number) => facets?.repos.find((r) => r.id === id)?.full_name || `#${id}`;
  const accName = (id: number) => facets?.accounts.find((a) => a.id === id)?.display_name || `#${id}`;

  const dims: FilterDim[] = [
    { key: "prov", label: "Provider", options: provOpts, selected: providers, onChange: setProviders, placeholder: "All providers" },
    { key: "acc", label: "Account", options: accOpts, selected: accounts, onChange: setAccounts, placeholder: "All accounts" },
    { key: "org", label: "Organization", options: orgOpts, selected: orgs, onChange: setOrgs, placeholder: "All orgs" },
    { key: "proj", label: "Workspace", options: projOpts, selected: projects, onChange: setProjects, placeholder: "All workspaces" },
    { key: "repo", label: "Repository", options: repoOpts, selected: repos, onChange: setRepos, placeholder: "All repos" },
    { key: "lang", label: "Language", options: langOpts, selected: languages, onChange: setLanguages, placeholder: "All languages" },
    { key: "lib", label: "Library / Framework", options: libOpts, selected: libraries, onChange: setLibraries, placeholder: "All libraries" },
    { key: "ai", label: "AI Agent", options: aiOpts, selected: aiAgents, onChange: setAiAgents, placeholder: "All agents" },
  ];
  const chips: { label: string; rm: () => void }[] = [
    ...[...providers].map((k) => ({ label: `provider: ${k}`, rm: () => del(providers, setProviders, k) })),
    ...[...orgs].map((k) => ({ label: `org: ${k}`, rm: () => del(orgs, setOrgs, k) })),
    ...[...projects].map((k) => ({ label: `project: ${k}`, rm: () => del(projects, setProjects, k) })),
    ...[...accounts].map((k) => ({ label: `account: ${accName(k)}`, rm: () => del(accounts, setAccounts, k) })),
    ...[...repos].map((k) => ({ label: `repo: ${repoName(k)}`, rm: () => del(repos, setRepos, k) })),
    ...[...languages].map((k) => ({ label: `lang: ${k}`, rm: () => del(languages, setLanguages, k) })),
    ...[...libraries].map((k) => ({ label: `lib: ${k}`, rm: () => del(libraries, setLibraries, k) })),
    ...[...aiAgents].map((k) => ({ label: `AI: ${k}`, rm: () => del(aiAgents, setAiAgents, k) })),
    ...(start || end ? [{ label: `date: ${start || "…"} → ${end || "…"}`, rm: () => { setStart(""); setEnd(""); } }] : []),
  ];
  const clearAll = () => { setProviders(S([])); setOrgs(S([])); setProjects(S([])); setAccounts(S([])); setRepos(S([])); setLanguages(S([])); setLibraries(S([])); setAiAgents(S([])); setStart(""); setEnd(""); };

  const light = (document.documentElement.dataset.theme || "dark") === "light";
  const txt = light ? "#1f2328" : "#c9d1d9";
  const grid = light ? "#eaeef2" : "#21262d";
  const weekly = useMemo(() => {
    const w = detail?.weekly || [];
    return {
      tooltip: { trigger: "axis" }, grid: { left: 44, right: 16, top: 16, bottom: 28 },
      xAxis: { type: "category", data: w.map((x) => x.week), axisLabel: { color: txt, show: false } },
      yAxis: { type: "value", axisLabel: { color: txt }, splitLine: { lineStyle: { color: grid } } },
      series: [{ type: "bar", data: w.map((x) => x.commits), itemStyle: { color: "#2f81f7" } }],
    };
  }, [detail, txt, grid]);

  const sigmaSettings = useMemo(() => ({
    defaultNodeType: "image", nodeProgramClasses: { image: NodeImageProgram },
    labelColor: { color: light ? "#1f2328" : "#e6edf3" }, labelWeight: "600",
    defaultEdgeColor: light ? "#d0d7de" : "#30363d", zIndex: true,
    allowInvalidContainer: true,  // tolerate the brief pre-layout 0-height measurement
  }), [light]);

  if (err) return <div style={{ padding: 40, color: "#f85149" }}>Error: {err}</div>;
  const cards = detail?.contributors || [];

  return (
    <div className="stats-layout">
      <FilterPanel dims={dims} open={sidebarOpen} onOpenChange={setSidebarOpen}
        activeCount={chips.length} chips={chips} onClear={clearAll}
        dateRange={{ start, end, setStart, setEnd }} />

      <div className="stats-main">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <b style={{ fontSize: 18 }}>Contributors</b>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>{graph?.list.length ?? "…"} people · click an avatar to drill in</span>
          {focus && <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setFocus(null)}>← all contributors</button>}
        </div>

        <div className="panel" style={{ height: 380, minHeight: 380, flexShrink: 0, padding: 0, overflow: "hidden", position: "relative" }}>
          {!graph ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>
            : graph.nodes.length === 0 ? <div style={{ padding: 40, color: "var(--muted)" }}>No contributors for these filters.</div>
              : (
                <SigmaContainer key={light ? "l" : "d"} style={{ height: "100%", width: "100%", background: "var(--bg)" }} settings={sigmaSettings}>
                  <LoadContribGraph data={graph} />
                  <ClickControl onPick={setFocus} />
                </SigmaContainer>
              )}
        </div>

        {/* Detail dashboard for the focused contributor (or the whole scope). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
          {detail && (
            <>
              <div className="card">
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  {focus && <img src={avatarUrl(detail.login || "", detail.avatar)} width={44} height={44} style={{ borderRadius: "50%" }} alt="" />}
                  <div>
                    <b style={{ fontSize: 16 }}>{focus ? (detail.name || detail.login) : "All contributors"}</b>
                    {focus && detail.rank > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>rank #{detail.rank}</span>}
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      {detail.commits.toLocaleString()} commits
                      {(detail.additions > 0 || detail.deletions > 0) && <>
                        {" · "}<span style={{ color: "#3fb950" }}>{fmt(detail.additions)}++</span>{" "}
                        <span style={{ color: "#f85149" }}>{fmt(detail.deletions)}--</span></>}
                    </div>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 13 }}>
                    <span title="merged PRs">🔀 <b>{detail.pulse.prs_merged}</b></span>
                    <span title="open PRs" style={{ color: "var(--muted)" }}>{detail.pulse.prs_open} open</span>
                    <span title="total PRs" style={{ color: "var(--muted)" }}>{detail.pulse.prs_total} total</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Commits over time (weekly)</div>
                <EChart option={weekly} height={180} />
              </div>

              {detail.languages.length > 0 && (
                <div className="card">
                  <b style={{ fontSize: 14 }}>Languages</b>
                  <div style={{ marginTop: 10 }}><LanguagesBar data={detail.languages} /></div>
                </div>
              )}

              <div>
                <b style={{ fontSize: 15 }}>Ranked contributors</b>
                <div className="charts-grid" style={{ marginTop: 10 }}>
                  {cards.map((c, i) => (
                    <ContribCard key={c.login} c={c} rank={i + 1} focused={c.login === focus} onClick={() => setFocus(c.login)} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
