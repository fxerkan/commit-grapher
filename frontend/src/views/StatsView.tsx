import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import "echarts-wordcloud";
import { api, ChartStats, Facets } from "../api";
import { Opt } from "../components/MultiSelect";
import FilterPanel, { FilterDim } from "../components/FilterPanel";

// One reusable ECharts canvas. `onClick` wires cross-filter / drill-down.
function EChart({ option, height = 260, onClick }: { option: any; height?: number; onClick?: (p: any) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const theme = document.documentElement.dataset.theme || "dark";
    const chart = echarts.init(ref.current, theme === "light" ? undefined : "dark");
    chart.setOption({ backgroundColor: "transparent", ...option });
    if (onClick) chart.on("click", onClick);
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); chart.dispose(); };
  }, [option, onClick]);
  return <div ref={ref} style={{ width: "100%", height }} />;
}

const S = (arr: Iterable<any>) => new Set(arr);
const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n ?? 0));
function ago(s: string | null | undefined): string {
  if (!s) return "";
  const t = new Date(s).getTime();
  if (isNaN(t)) return "";
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d <= 0) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  const y = d / 365;
  return `${y < 10 ? y.toFixed(1) : Math.round(y)}y ago`;
}
const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Kpi({ num, label, icon }: { num: React.ReactNode; label: string; icon: string }) {
  return (
    <div className="card kpi">
      <div className="kpi-num">{num}</div>
      <div className="kpi-label">{label}</div>
      <span className="kpi-icon">{icon}</span>
    </div>
  );
}
function Fact({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card fact">
      <div className="fact-head"><span className="fact-emoji">{emoji}</span>{title}</div>
      <div style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}
function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <b style={{ fontSize: 14 }}>{title}</b>
        {hint && <span style={{ fontSize: 11, color: "var(--muted)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function StatsView() {
  const [facets, setFacets] = useState<Facets | null>(null);
  const [s, setS] = useState<ChartStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Filter dimensions + date range.
  const [providers, setProviders] = useState<Set<any>>(S([]));
  const [orgs, setOrgs] = useState<Set<any>>(S([]));
  const [projects, setProjects] = useState<Set<any>>(S([]));
  const [accounts, setAccounts] = useState<Set<any>>(S([]));
  const [repos, setRepos] = useState<Set<any>>(S([]));
  const [authors, setAuthors] = useState<Set<any>>(S([]));
  const [tags, setTags] = useState<Set<any>>(S([]));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => { api.facets().then(setFacets).catch(() => {}); }, []);

  // Resolve all repo-scoping dimensions (incl. tags) to a concrete repo-id list.
  const repoDimActive = providers.size || orgs.size || projects.size || accounts.size || repos.size || tags.size;
  const effRepos = useMemo(() => (facets?.repos || []).filter((r) =>
    (!providers.size || providers.has(r.provider)) &&
    (!orgs.size || orgs.has(r.organization)) &&
    (!projects.size || projects.has(r.project)) &&
    (!accounts.size || accounts.has(r.account_id)) &&
    (!repos.size || repos.has(r.id)) &&
    (!tags.size || (r.tags || []).some((t) => tags.has(t)))
  ), [facets, providers, orgs, projects, accounts, repos, tags]);
  const repoIds = repoDimActive ? (effRepos.length ? effRepos.map((r) => r.id) : [-1]) : undefined;

  const qkey = JSON.stringify([repoIds, [...authors].sort(), start, end]);
  useEffect(() => {
    setLoading(true);
    api.charts({ repo_ids: repoIds, authors: [...authors] as string[], start: start || undefined, end: end || undefined })
      .then((d) => { setS(d); setErr(null); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [qkey]);

  const light = (document.documentElement.dataset.theme || "dark") === "light";
  const txt = light ? "#1f2328" : "#c9d1d9";
  const grid = light ? "#eaeef2" : "#21262d";

  // MultiSelect option lists (repo cascades off the higher dimensions).
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
  const authorOpts: Opt[] = (facets?.authors || []).map((a) => ({
    key: a.name, label: a.name, count: a.count, badge: a.bot ? "bot" : undefined, badgeColor: "#6e40c9",
  }));
  const tagOpts: Opt[] = (facets?.tags || []).map((t) => ({ key: t.name, label: t.name, count: t.count }));

  const repoName = (id: number) => facets?.repos.find((r) => r.id === id)?.full_name || `#${id}`;
  const accName = (id: number) => facets?.accounts.find((a) => a.id === id)?.display_name || `#${id}`;
  const del = (set: Set<any>, setter: (s: Set<any>) => void, k: any) => { const n = new Set(set); n.delete(k); setter(n); };
  const add = (set: Set<any>, setter: (s: Set<any>) => void, k: any) => { const n = new Set(set); n.add(k); setter(n); };

  const dims: FilterDim[] = [
    { key: "prov", label: "Provider", options: provOpts, selected: providers, onChange: setProviders, placeholder: "All providers" },
    { key: "org", label: "Organization", options: orgOpts, selected: orgs, onChange: setOrgs, placeholder: "All orgs" },
    { key: "proj", label: "Project / Workspace", options: projOpts, selected: projects, onChange: setProjects, placeholder: "All projects" },
    { key: "acc", label: "Account", options: accOpts, selected: accounts, onChange: setAccounts, placeholder: "All accounts" },
    { key: "repo", label: "Repository", options: repoOpts, selected: repos, onChange: setRepos, placeholder: "All repos" },
    { key: "auth", label: "Author", options: authorOpts, selected: authors, onChange: setAuthors, placeholder: "All authors" },
    { key: "tag", label: "Tag", options: tagOpts, selected: tags, onChange: setTags, placeholder: "All tags" },
  ];
  const chips: { label: string; rm: () => void }[] = [
    ...[...providers].map((k) => ({ label: `provider: ${k}`, rm: () => del(providers, setProviders, k) })),
    ...[...orgs].map((k) => ({ label: `org: ${k}`, rm: () => del(orgs, setOrgs, k) })),
    ...[...projects].map((k) => ({ label: `project: ${k}`, rm: () => del(projects, setProjects, k) })),
    ...[...accounts].map((k) => ({ label: `account: ${accName(k)}`, rm: () => del(accounts, setAccounts, k) })),
    ...[...repos].map((k) => ({ label: `repo: ${repoName(k)}`, rm: () => del(repos, setRepos, k) })),
    ...[...authors].map((k) => ({ label: `author: ${k}`, rm: () => del(authors, setAuthors, k) })),
    ...[...tags].map((k) => ({ label: `tag: ${k}`, rm: () => del(tags, setTags, k) })),
    ...(start || end ? [{ label: `date: ${start || "…"} → ${end || "…"}`, rm: () => { setStart(""); setEnd(""); } }] : []),
  ];
  const clearAll = () => { setProviders(S([])); setOrgs(S([])); setProjects(S([])); setAccounts(S([])); setRepos(S([])); setAuthors(S([])); setTags(S([])); setStart(""); setEnd(""); };

  // ── ECharts options ────────────────────────────────────────────────
  const months = useMemo(() => Object.keys(s?.monthly || {}), [s]);
  const timeline = useMemo(() => ({
    tooltip: { trigger: "axis" }, grid: { left: 48, right: 16, top: 16, bottom: 28 },
    xAxis: { type: "category", data: months, axisLabel: { color: txt } },
    yAxis: { type: "value", axisLabel: { color: txt }, splitLine: { lineStyle: { color: grid } } },
    series: [{
      type: "line", smooth: true, symbol: "none", data: months.map((m) => s!.monthly[m]),
      lineStyle: { width: 2, color: "#39d353" },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "rgba(57,211,83,.5)" }, { offset: 1, color: "rgba(57,211,83,0)" }]) },
    }],
  }), [months, s, txt, grid]);
  const topRepos = useMemo(() => ({
    tooltip: {}, series: [{
      type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
      data: s?.top_repos || [], label: { color: "#fff" },
      levels: [{ itemStyle: { borderColor: light ? "#fff" : "#0d1117", borderWidth: 2, gapWidth: 2 } }],
    }],
  }), [s, light]);
  const prStates = useMemo(() => ({
    tooltip: { trigger: "item" }, legend: { bottom: 0, textStyle: { color: txt } },
    series: [{ type: "pie", radius: ["38%", "68%"], roseType: "radius", center: ["50%", "45%"], data: s?.pr_states || [], label: { color: txt } }],
  }), [s, txt]);
  const authorsCloud = useMemo(() => ({
    tooltip: {}, series: [{
      type: "wordCloud", gridSize: 8, sizeRange: [14, 58], rotationRange: [0, 0],
      textStyle: { color: () => ["#58a6ff", "#39d353", "#bc8cff", "#f78166"][Math.floor(Math.random() * 4)] },
      data: s?.authors || [],
    }],
  }), [s]);
  const nightOwl = useMemo(() => ({
    tooltip: { formatter: (p: any) => `${p.name}:00 — ${p.value} commits` },
    polar: { radius: [12, "72%"] },
    angleAxis: { type: "category", data: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")), axisLabel: { color: txt, fontSize: 10 } },
    radiusAxis: { axisLabel: { color: txt }, splitLine: { lineStyle: { color: grid } } },
    series: [{ type: "bar", coordinateSystem: "polar", data: s?.by_hour || [], itemStyle: { color: "#bc8cff" } }],
  }), [s, txt, grid]);
  const weekday = useMemo(() => ({
    tooltip: {}, grid: { left: 40, right: 16, top: 16, bottom: 28 },
    xAxis: { type: "category", data: DAY, axisLabel: { color: txt } },
    yAxis: { type: "value", axisLabel: { color: txt }, splitLine: { lineStyle: { color: grid } } },
    series: [{ type: "bar", data: (s?.by_weekday || []).map((v, i) => ({ value: v, itemStyle: { color: i >= 5 ? "#f78166" : "#58a6ff" } })), barWidth: "55%" }],
  }), [s, txt, grid]);
  const topStarred = useMemo(() => ({
    tooltip: {}, grid: { left: 8, right: 20, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value", axisLabel: { color: txt }, splitLine: { lineStyle: { color: grid } } },
    yAxis: { type: "category", data: (s?.top_starred || []).map((r) => r.name).reverse(), axisLabel: { color: txt } },
    series: [{ type: "bar", data: (s?.top_starred || []).map((r) => ({ value: r.value, id: r.id })).reverse(), itemStyle: { color: "#e3b341" } }],
  }), [s, txt, grid]);
  const tagCloud = useMemo(() => ({
    tooltip: {}, series: [{
      type: "wordCloud", gridSize: 6, sizeRange: [12, 46], rotationRange: [-45, 45],
      textStyle: { color: () => ["#e3b341", "#58a6ff", "#39d353", "#f78166"][Math.floor(Math.random() * 4)] },
      data: s?.tags || [],
    }],
  }), [s]);

  if (err) return <div style={{ padding: 40, color: "#f85149" }}>Error: {err}</div>;

  const t = s?.totals;
  const f = s?.facts;
  const rs = s?.repo_stats;
  const owl = s?.night_owl_hour ?? 0;
  const hasRepoStats = rs && Object.values(rs).some((v) => v > 0);

  return (
    <div style={{ padding: 20 }} className="stats-layout">
      <FilterPanel dims={dims} open={sidebarOpen} onOpenChange={setSidebarOpen}
        activeCount={chips.length} chips={chips} onClear={clearAll}
        dateRange={{ start, end, setStart, setEnd }} />

      <div className="stats-main">
        {!s || !s.totals ? <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div> : (
          <div className={loading ? "stats-loading" : undefined} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* KPI hero row */}
            <div className="kpi-grid">
              <Kpi num={t!.commits.toLocaleString()} label="Commits" icon="🧬" />
              <Kpi num={t!.repos.toLocaleString()} label="Repositories" icon="📦" />
              <Kpi num={t!.authors.toLocaleString()} label="Authors" icon="🧑‍💻" />
              <Kpi num={t!.prs.toLocaleString()} label="Pull Requests" icon="🔀" />
              <Kpi num={t!.active_days.toLocaleString()} label="Active Days" icon="📅" />
              <Kpi num={`${t!.streak}🔥`} label="Longest Streak" icon="⚡" />
            </div>

            {t!.commits === 0 ? (
              <div className="card" style={{ color: "var(--muted)" }}>No commits match these filters. Loosen the filters or widen the date range.</div>
            ) : (
              <>
                {/* Fun deep-dive facts (3 columns × 2 rows) */}
                <div className="facts-grid">
                  <Fact emoji="📜" title="The Essay — longest commit message">
                    {f?.longest_commit ? <>
                      <div style={{ fontStyle: "italic", maxHeight: 88, overflow: "hidden" }}>“{f.longest_commit.message.split("\n")[0].slice(0, 220)}”</div>
                      <div style={{ color: "var(--muted)", marginTop: 6 }}>
                        {f.longest_commit.len.toLocaleString()} chars · {f.longest_commit.author || "?"} · {f.longest_commit.repo}
                        {f.longest_commit.url && <> · <a href={f.longest_commit.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>open ↗</a></>}
                      </div>
                    </> : "—"}
                  </Fact>
                  <Fact emoji="🌌" title="A long time ago, in a repo far, far away…">
                    {f?.far_away_commit ? <>
                      <div>The oldest commit on record: <b>{ago(f.far_away_commit.committed_at)}</b> ({f.far_away_commit.committed_at.slice(0, 10)})</div>
                      <div style={{ color: "var(--muted)", marginTop: 6 }}>
                        {f.far_away_commit.author || "?"} · {f.far_away_commit.repo}
                        {f.far_away_commit.url && <> · <a href={f.far_away_commit.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>open ↗</a></>}
                      </div>
                      <div style={{ marginTop: 6, fontStyle: "italic" }}>“{f.far_away_commit.message.split("\n")[0].slice(0, 120)}”</div>
                    </> : "—"}
                  </Fact>
                  <Fact emoji="🛰️" title="Far, far away — oldest open trail (PR)">
                    {f?.far_away_pr ? <>
                      <div>#{f.far_away_pr.number} <b>{ago(f.far_away_pr.created_at)}</b> · <span style={{ color: "var(--muted)" }}>{f.far_away_pr.state}</span></div>
                      <div style={{ marginTop: 6, fontStyle: "italic" }}>“{(f.far_away_pr.title || "").slice(0, 120)}”</div>
                      <div style={{ color: "var(--muted)", marginTop: 6 }}>{f.far_away_pr.author || "?"} · {f.far_away_pr.repo}</div>
                    </> : "No pull requests in scope."}
                  </Fact>
                  <Fact emoji="👯" title="Code Besties — most co-committed peers">
                    {f?.besties?.length ? f.besties.map((b, i) => (
                      <div key={i} style={{ marginBottom: 4 }}>
                        <span className="clickable" style={{ color: "var(--accent)" }} onClick={() => setAuthors(S([b.a, b.b]))}>{b.a} ✦ {b.b}</span>
                        <span style={{ color: "var(--muted)" }}> — {b.shared} shared repo{b.shared > 1 ? "s" : ""}</span>
                      </div>
                    )) : "Fly solo — no shared repos yet."}
                  </Fact>
                  <Fact emoji="🪦" title="The Graveyard — R.I.P dormant repos">
                    {f?.graveyard?.length ? f.graveyard.map((g) => (
                      <div key={g.id} style={{ marginBottom: 4, display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span className="clickable" style={{ color: "var(--accent)" }} onClick={() => add(repos, setRepos, g.id)}>{g.repo}</span>
                        <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>🥀 {ago(g.last)}</span>
                      </div>
                    )) : "—"}
                  </Fact>
                  <Fact emoji="🌙" title="Night Owl & Busy Day">
                    <div>Most commits land around <b>{String(owl).padStart(2, "0")}:00</b> {owl < 6 || owl >= 22 ? "🦉" : owl < 12 ? "🌅" : owl < 18 ? "☀️" : "🌆"}</div>
                    {s.busiest_day && <div style={{ marginTop: 6 }}>Busiest single day: <b>{s.busiest_day.day}</b> — {s.busiest_day.count} commits 🚀</div>}
                    <div style={{ color: "var(--muted)", marginTop: 6 }}>Weekend vs weekday? See the chart below.</div>
                  </Fact>
                </div>

                {/* Repository stats */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <b style={{ fontSize: 16 }}>Repository stats</b>
                  {!hasRepoStats && <span style={{ fontSize: 12, color: "var(--muted)" }}>— re-sync accounts to populate stars, forks, releases, tags…</span>}
                </div>
                {hasRepoStats && (
                  <div className="kpi-grid">
                    <Kpi num={fmt(rs!.stars)} label="Stars" icon="⭐" />
                    <Kpi num={fmt(rs!.forks)} label="Forks" icon="🍴" />
                    <Kpi num={fmt(rs!.releases)} label="Releases" icon="🚀" />
                    <Kpi num={fmt(rs!.contributors)} label="Contributors" icon="👥" />
                    <Kpi num={fmt(rs!.downloads)} label="Release DLs" icon="⬇️" />
                    <Kpi num={fmt(rs!.builds)} label="Builds" icon="🏗️" />
                    {rs!.docker_pulls > 0 && <Kpi num={fmt(rs!.docker_pulls)} label="Docker Pulls" icon="🐳" />}
                    {rs!.npm_downloads > 0 && <Kpi num={fmt(rs!.npm_downloads)} label="npm DLs / mo" icon="📦" />}
                    {rs!.open_issues > 0 && <Kpi num={fmt(rs!.open_issues)} label="Open Issues" icon="🐛" />}
                    {rs!.watchers > 0 && <Kpi num={fmt(rs!.watchers)} label="Watchers" icon="👀" />}
                  </div>
                )}

                {/* Charts grid */}
                <div className="charts-grid">
                  <ChartCard title="Commits over time"><EChart option={timeline} /></ChartCard>
                  <ChartCard title="Top repositories" hint="click to drill in">
                    <EChart option={topRepos} onClick={(p: any) => p.data?.id != null && add(repos, setRepos, p.data.id)} />
                  </ChartCard>
                  <ChartCard title="Authors" hint="click to drill in">
                    <EChart option={authorsCloud} onClick={(p: any) => p.name && add(authors, setAuthors, p.name)} />
                  </ChartCard>
                  <ChartCard title="Pull requests by state"><EChart option={prStates} /></ChartCard>
                  <ChartCard title="Night owl — commits by hour" hint="24h clock"><EChart option={nightOwl} height={280} /></ChartCard>
                  <ChartCard title="Weekend warrior — commits by weekday"><EChart option={weekday} /></ChartCard>
                  {(s.top_starred?.length ?? 0) > 0 && (
                    <ChartCard title="Most-starred repositories" hint="click to drill in">
                      <EChart option={topStarred} onClick={(p: any) => p.data?.id != null && add(repos, setRepos, p.data.id)} />
                    </ChartCard>
                  )}
                  {(s.tags?.length ?? 0) > 0 && (
                    <ChartCard title="Tags" hint="click to filter">
                      <EChart option={tagCloud} onClick={(p: any) => p.name && add(tags, setTags, p.name)} />
                    </ChartCard>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
