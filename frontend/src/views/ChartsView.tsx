import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import "echarts-wordcloud";
import { api, ChartStats, Facets } from "../api";

interface Flt { provider: string; repo_id: number | null; author: string }

// One reusable ECharts canvas. `onEvent` wires cross-filter clicks.
function EChart({ option, height = 300, onClick }: { option: any; height?: number; onClick?: (p: any) => void }) {
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

const card: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 };
const sel: React.CSSProperties = { padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--fg)" };

export default function ChartsView() {
  const [s, setS] = useState<ChartStats | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flt, setFlt] = useState<Flt>({ provider: "", repo_id: null, author: "" });

  useEffect(() => { api.facets().then(setFacets).catch(() => {}); }, []);
  useEffect(() => {
    api.charts({ provider: flt.provider || undefined, repo_id: flt.repo_id ?? undefined, author: flt.author || undefined })
      .then(setS).catch((e) => setErr(e.message));
  }, [flt]);

  const txt = (document.documentElement.dataset.theme || "dark") === "light" ? "#1f2328" : "#c9d1d9";
  const upd = (p: Partial<Flt>) => setFlt((f) => ({ ...f, ...p }));

  const months = useMemo(() => Object.keys(s?.monthly || {}), [s]);
  if (err) return <div style={{ padding: 40, color: "#f85149" }}>Error: {err}</div>;
  if (!s) return <div style={{ padding: 40 }}>Loading…</div>;

  const title = (t: string) => ({ text: t, textStyle: { color: txt, fontSize: 14 } });
  const timeline = {
    title: title("Commits over time"), tooltip: { trigger: "axis" },
    grid: { left: 50, right: 20, top: 50, bottom: 40 },
    xAxis: { type: "category", data: months, axisLabel: { color: txt } },
    yAxis: { type: "value", axisLabel: { color: txt } },
    series: [{ type: "bar", data: months.map((m) => s.monthly[m]), itemStyle: { color: "#39d353" } }],
  };
  const topRepos = {
    title: title("Top repositories by commits — click to filter"), tooltip: {},
    series: [{
      type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
      data: s.top_repos, label: { color: "#fff" },
      levels: [{ itemStyle: { borderColor: "#0d1117", borderWidth: 2, gapWidth: 2 } }],
    }],
  };
  const prStates = {
    title: title("Pull requests by state"), tooltip: { trigger: "item" },
    series: [{ type: "pie", radius: ["40%", "70%"], data: s.pr_states, label: { color: txt } }],
  };
  const authors = {
    title: title("Authors — click to filter"), tooltip: {},
    series: [{
      type: "wordCloud", gridSize: 8, sizeRange: [14, 60], rotationRange: [0, 0],
      textStyle: { color: () => ["#58a6ff", "#39d353", "#bc8cff", "#f78166"][Math.floor(Math.random() * 4)] },
      data: s.authors,
    }],
  };

  const repoName = flt.repo_id != null ? facets?.repos.find((r) => r.id === flt.repo_id)?.full_name : null;

  return (
    <div style={{ padding: 20 }}>
      {/* Cross-filter bar: selections here filter every chart. */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16, padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel)" }}>
        <b style={{ color: "var(--muted)" }}>Filters:</b>
        <select style={sel} value={flt.provider} onChange={(e) => upd({ provider: e.target.value })}>
          <option value="">All providers</option>
          {facets?.providers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select style={sel} value={flt.repo_id ?? ""} onChange={(e) => upd({ repo_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">All repos</option>
          {facets?.repos.filter((r) => !flt.provider || r.provider === flt.provider).map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
        </select>
        <select style={sel} value={flt.author} onChange={(e) => upd({ author: e.target.value })}>
          <option value="">All authors</option>
          {facets?.authors.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
        </select>
        {(flt.provider || flt.repo_id != null || flt.author) && (
          <button style={{ ...sel, cursor: "pointer" }} onClick={() => setFlt({ provider: "", repo_id: null, author: "" })}>✕ clear</button>
        )}
        {repoName && <span style={{ color: "var(--accent)" }}>repo: {repoName}</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={card}><EChart option={timeline} /></div>
        <div style={card}><EChart option={topRepos} onClick={(p: any) => p.data?.id != null && upd({ repo_id: p.data.id })} /></div>
        <div style={card}><EChart option={prStates} /></div>
        <div style={card}><EChart option={authors} onClick={(p: any) => p.name && upd({ author: p.name })} /></div>
      </div>
    </div>
  );
}
