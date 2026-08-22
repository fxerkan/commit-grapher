import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api";

const GraphView = lazy(() => import("./views/GraphView"));
const HeatmapView = lazy(() => import("./views/HeatmapView"));
const StatsView = lazy(() => import("./views/StatsView"));
const ContributorsView = lazy(() => import("./views/ContributorsView"));
const Accounts = lazy(() => import("./views/Accounts"));
const Onboarding = lazy(() => import("./views/Onboarding"));

type Tab = "graph" | "heatmap" | "stats" | "contributors" | "accounts";
const TABS: [Tab, string][] = [
  ["graph", "Network Graph"],
  ["heatmap", "Contribution Heatmap"],
  ["stats", "Stats"],
  ["contributors", "Contributors"],
  ["accounts", "Accounts"],
];

export default function App() {
  const [tab, setTab] = useState<Tab>("graph");
  const [theme, setTheme] = useState<"dark" | "light">(
    (localStorage.getItem("theme") as "dark" | "light") || "dark"
  );
  const [onboard, setOnboard] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  // First run: no accounts yet → show the welcome wizard.
  useEffect(() => {
    api.accounts().then((a) => { if (a.length === 0) setOnboard(true); }).catch(() => {});
  }, []);

  if (onboard)
    return (
      <div style={{ height: "100vh", overflow: "auto", background: "var(--bg)", color: "var(--fg)" }}>
        <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
          <Onboarding onDone={() => setOnboard(false)} />
        </Suspense>
      </div>
    );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--fg)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 18 }}>
          <span style={{ color: "var(--accent)" }}>❯ commit-graph</span>
          <span style={{ color: "var(--accent2)" }}>er</span>
        </strong>
        <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={tab === id ? "btn btn-active" : "btn"}
              style={{ padding: "6px 12px", color: tab === id ? "#fff" : "var(--muted)" }}>{label}</button>
          ))}
        </nav>
        <button onClick={() => setOnboard(true)} className="btn" style={{ marginLeft: "auto", color: "var(--muted)", padding: "6px 12px" }}>
          ＋ Add account
        </button>
        <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} title="Toggle theme"
          className="btn" style={{ color: "var(--muted)", padding: "6px 12px" }}>
          {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
        </button>
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
          {tab === "graph" && <GraphView />}
          {tab === "heatmap" && <HeatmapView />}
          {tab === "stats" && <StatsView />}
          {tab === "contributors" && <ContributorsView />}
          {tab === "accounts" && <Accounts />}
        </Suspense>
      </main>
    </div>
  );
}
