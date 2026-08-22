import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { api, CommitRow, Facets } from "../api";
import GitGraph from "../components/GitGraph";

const toGit = (c: CommitRow) => ({
  sha: c.sha, parents: (c.parents || "").split(",").filter(Boolean), message: c.message || c.sha,
  author: c.author, url: c.url, committed_at: c.committed_at, branch: c.branch_ref,
});

const sel: React.CSSProperties = { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--fg)" };

export default function HeatmapView() {
  const ref = useRef<HTMLDivElement>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flt, setFlt] = useState<{ provider: string; repo_id: number | null; author: string }>({ provider: "", repo_id: null, author: "" });
  const [day, setDay] = useState<string | null>(null);
  const [dayCommits, setDayCommits] = useState<CommitRow[] | null>(null);

  useEffect(() => { api.facets().then(setFacets).catch(() => {}); }, []);
  useEffect(() => {
    api.heatmap({ provider: flt.provider || undefined, repo_id: flt.repo_id ?? undefined, author: flt.author || undefined })
      .then(setCounts).catch((e) => setErr(e.message));
  }, [flt]);

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
    setDayCommits(null);  // reset so the git-graph below refreshes on each new day
    api.commits({ date: day, provider: flt.provider || undefined, repo_id: flt.repo_id ?? undefined, author: flt.author || undefined, limit: 1000 })
      .then(setDayCommits).catch(() => setDayCommits([]));
  }, [day, flt]);

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

  if (err) return <div style={{ padding: 40, color: "#f85149" }}>Error: {err}</div>;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const upd = (p: Partial<typeof flt>) => setFlt((f) => ({ ...f, ...p }));

  const byRepo = useMemo(() => {
    const g: Record<string, CommitRow[]> = {};
    (dayCommits || []).forEach((c) => (g[c.repo] ||= []).push(c));
    return g;
  }, [dayCommits]);
  const repoId = (name: string) => facets?.repos.find((r) => r.full_name === name)?.id;

  return (
    <div style={{ padding: 20 }}>
      {/* filter bar (same dimensions as the graph) */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14, padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)" }}>
        <b style={{ color: "var(--muted)" }}>Filters:</b>
        <select style={sel} value={flt.provider} onChange={(e) => upd({ provider: e.target.value })}>
          <option value="">All providers</option>{facets?.providers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select style={sel} value={flt.repo_id ?? ""} onChange={(e) => upd({ repo_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">All repos</option>{facets?.repos.filter((r) => !flt.provider || r.provider === flt.provider).map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
        </select>
        <select style={sel} value={flt.author} onChange={(e) => upd({ author: e.target.value })}>
          <option value="">All authors</option>{facets?.authors.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
        </select>
        {(flt.provider || flt.repo_id != null || flt.author) && <button style={{ ...sel, cursor: "pointer" }} onClick={() => setFlt({ provider: "", repo_id: null, author: "" })}>✕ clear</button>}
      </div>

      <div style={{ marginBottom: 10 }}>
        <b>{total}</b> commits total
        <span style={{ marginLeft: 12 }}>
          {years.map((y) => (
            <button key={y} onClick={() => setYear(y)} style={{ marginRight: 5, padding: "3px 9px", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", background: y === activeYear ? "var(--accent)" : "transparent", color: y === activeYear ? "#fff" : "var(--muted)" }}>{y}</button>
          ))}
        </span>
      </div>
      <div ref={ref} style={{ width: "100%", height: 190 }} />
      {total === 0 && <div style={{ color: "var(--muted)" }}>No commits for these filters.</div>}

      {day && (
        <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
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
  );
}
