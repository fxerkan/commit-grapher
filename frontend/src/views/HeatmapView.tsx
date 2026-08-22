import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { api, CommitRow, Facets } from "../api";
import { Opt } from "../components/MultiSelect";
import FilterPanel, { FilterDim } from "../components/FilterPanel";
import GitGraph from "../components/GitGraph";

const toGit = (c: CommitRow) => ({
  sha: c.sha, parents: (c.parents || "").split(",").filter(Boolean), message: c.message || c.sha,
  author: c.author, url: c.url, committed_at: c.committed_at, branch: c.branch_ref,
});
const S = (arr: Iterable<any>) => new Set(arr);
const sel: React.CSSProperties = { padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--fg)" };

export default function HeatmapView() {
  const ref = useRef<HTMLDivElement>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [dayCommits, setDayCommits] = useState<CommitRow[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Same filter dimensions + date range as every other page.
  const [providers, setProviders] = useState<Set<any>>(S([]));
  const [orgs, setOrgs] = useState<Set<any>>(S([]));
  const [projects, setProjects] = useState<Set<any>>(S([]));
  const [accounts, setAccounts] = useState<Set<any>>(S([]));
  const [repos, setRepos] = useState<Set<any>>(S([]));
  const [authors, setAuthors] = useState<Set<any>>(S([]));
  const [tags, setTags] = useState<Set<any>>(S([]));
  const [languages, setLanguages] = useState<Set<any>>(S([]));
  const [libraries, setLibraries] = useState<Set<any>>(S([]));
  const [aiAgents, setAiAgents] = useState<Set<any>>(S([]));
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Cascading facets: author/tag/repo lists narrow to the current selection.
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

  const repoDimActive = providers.size || orgs.size || projects.size || accounts.size || repos.size || tags.size || languages.size || libraries.size;
  const effRepos = useMemo(() => (facets?.repos || []).filter((r) =>
    (!providers.size || providers.has(r.provider)) &&
    (!orgs.size || orgs.has(r.organization)) &&
    (!projects.size || projects.has(r.project)) &&
    (!accounts.size || accounts.has(r.account_id)) &&
    (!repos.size || repos.has(r.id)) &&
    (!tags.size || (r.tags || []).some((t) => tags.has(t))) &&
    (!languages.size || (r.languages || []).some((l) => languages.has(l))) &&
    (!libraries.size || (r.libraries || []).some((l) => libraries.has(l)))
  ), [facets, providers, orgs, projects, accounts, repos, tags, languages, libraries]);
  const repoIds = repoDimActive ? (effRepos.length ? effRepos.map((r) => r.id) : [-1]) : undefined;
  const authorList = [...authors] as string[];
  const aiList = aiAgents.size ? [...aiAgents].map(String) : undefined;
  const qkey = JSON.stringify([repoIds, authorList.sort(), [...aiAgents].sort(), start, end]);

  useEffect(() => {
    api.heatmap({ repo_ids: repoIds, authors: authorList, ai_agents: aiList, start: start || undefined, end: end || undefined })
      .then(setCounts).catch((e) => setErr(e.message));
  }, [qkey]);

  // Year buttons: always at least the last 10 years, plus any older year with data.
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const dataYears = Object.keys(counts || {}).map((d) => +d.slice(0, 4));
    const min = Math.min(now - 9, ...(dataYears.length ? dataYears : [now]));
    return Array.from({ length: now - min + 1 }, (_, i) => String(now - i));
  }, [counts]);
  const [year, setYear] = useState<string>("");
  const activeYear = year || years[0];

  useEffect(() => {
    if (!day) { setDayCommits(null); return; }
    setDayCommits(null);
    api.commits({ date: day, repo_ids: repoIds, authors: authorList, ai_agents: aiList, start: start || undefined, end: end || undefined, limit: 1000 })
      .then(setDayCommits).catch(() => setDayCommits([]));
  }, [day, qkey]);

  useEffect(() => {
    if (!ref.current || !counts) return;
    const light = (document.documentElement.dataset.theme || "dark") === "light";
    const chart = echarts.init(ref.current, light ? undefined : "dark");
    const axc = light ? "#57606a" : "#8b949e";
    const data = Object.entries(counts).filter(([d]) => d.startsWith(activeYear)).map(([d, v]) => [d, v]);
    const max = Math.max(1, ...data.map(([, v]) => v as number));
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: { formatter: (p: any) => `${p.value[0]}: ${p.value[1]} commits — click to drill down` },
      visualMap: { min: 0, max, show: false, inRange: { color: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"] } },
      calendar: {
        range: activeYear, cellSize: [16, 16], top: 30, left: 40, right: 20,
        itemStyle: { color: light ? "#ebedf0" : "#161b22", borderColor: light ? "#fff" : "#0d1117", borderWidth: 2 },
        splitLine: { show: false }, dayLabel: { color: axc }, monthLabel: { color: axc }, yearLabel: { show: false },
      },
      series: { type: "heatmap", coordinateSystem: "calendar", data },
    });
    chart.on("click", (p: any) => { if (p.value) setDay(p.value[0]); });
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); chart.dispose(); };
  }, [counts, activeYear]);

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

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
  const authorOpts: Opt[] = (facets?.authors || []).map((a) => ({ key: a.name, label: a.name, count: a.count, badge: a.bot ? "bot" : undefined, badgeColor: "#6e40c9" }));
  const tagOpts: Opt[] = (facets?.tags || []).map((t) => ({ key: t.name, label: t.name, count: t.count }));
  const langOpts: Opt[] = (facets?.languages || []).map((l) => ({ key: l.name, label: l.name, count: l.count }));
  const libOpts: Opt[] = (facets?.libraries || []).map((l) => ({ key: l.name, label: l.name, count: l.count }));
  const aiOpts: Opt[] = (facets?.ai_agents || []).map((a) => ({ key: a.name, label: a.name, count: a.count, badge: "AI", badgeColor: "#6e40c9" }));

  const repoName = (id: number) => facets?.repos.find((r) => r.id === id)?.full_name || `#${id}`;
  const accName = (id: number) => facets?.accounts.find((a) => a.id === id)?.display_name || `#${id}`;
  const del = (set: Set<any>, setter: (s: Set<any>) => void, k: any) => { const n = new Set(set); n.delete(k); setter(n); };

  // Order: Provider > Account > Organization > Workspace > Repo > Author > Tag > Date.
  const dims: FilterDim[] = [
    { key: "prov", label: "Provider", options: provOpts, selected: providers, onChange: setProviders, placeholder: "All providers" },
    { key: "acc", label: "Account", options: accOpts, selected: accounts, onChange: setAccounts, placeholder: "All accounts" },
    { key: "org", label: "Organization", options: orgOpts, selected: orgs, onChange: setOrgs, placeholder: "All orgs" },
    { key: "proj", label: "Workspace", options: projOpts, selected: projects, onChange: setProjects, placeholder: "All workspaces" },
    { key: "repo", label: "Repository", options: repoOpts, selected: repos, onChange: setRepos, placeholder: "All repos" },
    { key: "auth", label: "Author", options: authorOpts, selected: authors, onChange: setAuthors, placeholder: "All authors" },
    { key: "lang", label: "Language", options: langOpts, selected: languages, onChange: setLanguages, placeholder: "All languages" },
    { key: "lib", label: "Library / Framework", options: libOpts, selected: libraries, onChange: setLibraries, placeholder: "All libraries" },
    { key: "ai", label: "AI Agent", options: aiOpts, selected: aiAgents, onChange: setAiAgents, placeholder: "All agents" },
    { key: "tag", label: "Tag", options: tagOpts, selected: tags, onChange: setTags, placeholder: "All tags" },
  ];
  const chips: { label: string; rm: () => void }[] = [
    ...[...providers].map((k) => ({ label: `provider: ${k}`, rm: () => del(providers, setProviders, k) })),
    ...[...orgs].map((k) => ({ label: `org: ${k}`, rm: () => del(orgs, setOrgs, k) })),
    ...[...projects].map((k) => ({ label: `project: ${k}`, rm: () => del(projects, setProjects, k) })),
    ...[...accounts].map((k) => ({ label: `account: ${accName(k)}`, rm: () => del(accounts, setAccounts, k) })),
    ...[...repos].map((k) => ({ label: `repo: ${repoName(k)}`, rm: () => del(repos, setRepos, k) })),
    ...[...authors].map((k) => ({ label: `author: ${k}`, rm: () => del(authors, setAuthors, k) })),
    ...[...languages].map((k) => ({ label: `lang: ${k}`, rm: () => del(languages, setLanguages, k) })),
    ...[...libraries].map((k) => ({ label: `lib: ${k}`, rm: () => del(libraries, setLibraries, k) })),
    ...[...aiAgents].map((k) => ({ label: `AI: ${k}`, rm: () => del(aiAgents, setAiAgents, k) })),
    ...[...tags].map((k) => ({ label: `tag: ${k}`, rm: () => del(tags, setTags, k) })),
    ...(start || end ? [{ label: `date: ${start || "…"} → ${end || "…"}`, rm: () => { setStart(""); setEnd(""); } }] : []),
  ];
  const clearAll = () => { setProviders(S([])); setOrgs(S([])); setProjects(S([])); setAccounts(S([])); setRepos(S([])); setAuthors(S([])); setTags(S([])); setLanguages(S([])); setLibraries(S([])); setAiAgents(S([])); setStart(""); setEnd(""); };

  const byRepo = useMemo(() => {
    const g: Record<string, CommitRow[]> = {};
    (dayCommits || []).forEach((c) => (g[c.repo] ||= []).push(c));
    return g;
  }, [dayCommits]);

  if (err) return <div style={{ padding: 40, color: "#f85149" }}>Error: {err}</div>;

  return (
    <div className="stats-layout">
      <FilterPanel dims={dims} open={sidebarOpen} onOpenChange={setSidebarOpen}
        activeCount={chips.length} chips={chips} onClear={clearAll}
        dateRange={{ start, end, setStart, setEnd }} />

      <div className="stats-main">
        <div style={{ marginBottom: 10 }}>
          <b>{total.toLocaleString()}</b> commits total
          <span style={{ marginLeft: 12 }}>
            {years.map((y) => (
              <button key={y} onClick={() => setYear(y)} className={y === activeYear ? "btn btn-active" : "btn"} style={{ marginRight: 5, padding: "3px 9px" }}>{y}</button>
            ))}
          </span>
        </div>
        <div className="panel"><div ref={ref} style={{ width: "100%", height: 190 }} /></div>
        {total === 0 && <div style={{ color: "var(--muted)", marginTop: 10 }}>No commits for these filters.</div>}

        {day && (
          <div className="panel" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <b style={{ fontSize: 16 }}>Commits on {day}</b>
              <span style={{ color: "var(--muted)" }}>{dayCommits?.length ?? "…"} across {Object.keys(byRepo).length} repos</span>
              <button onClick={() => setDay(null)} style={{ marginLeft: "auto", ...sel, cursor: "pointer" }}>✕ close</button>
            </div>

            {dayCommits === null ? <div style={{ color: "var(--muted)" }}>Loading…</div> :
              Object.entries(byRepo).map(([repo, commits]) => (
                <div key={repo} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <b style={{ color: "var(--fg)" }}>{repo}</b>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>{commits.length} commits</span>
                  </div>
                  <GitGraph commits={commits.map(toGit)} />
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
