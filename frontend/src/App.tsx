import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api";

const GraphView = lazy(() => import("./views/GraphView"));
const HeatmapView = lazy(() => import("./views/HeatmapView"));
const ChartsView = lazy(() => import("./views/ChartsView"));
const Accounts = lazy(() => import("./views/Accounts"));
const Onboarding = lazy(() => import("./views/Onboarding"));

type Tab = "graph" | "heatmap" | "charts" | "accounts";
const TABS: [Tab, string][] = [
  ["graph", "Network Graph"],
  ["heatmap", "Contribution Heatmap"],
  ["charts", "Charts"],
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
      <header style={{ display: "flex", alignItems: "center", gap: 24, padding: "10px 20px", borderBottom: "1px solid var(--border)" }}>
        <strong style={{ fontSize: 18 }}>
          <span style={{ color: "var(--accent)" }}>❯ commit-graph</span>
          <span style={{ color: "var(--accent2)" }}>er</span>
        </strong>
        <nav style={{ display: "flex", gap: 8 }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              background: tab === id ? "var(--accent)" : "transparent",
              color: tab === id ? "#fff" : "var(--muted)",
              border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", cursor: "pointer",
            }}>{label}</button>
          ))}
        </nav>
        <button onClick={() => setOnboard(true)}
          style={{ marginLeft: "auto", background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
          ＋ Add account
        </button>
        <button onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          title="Toggle theme"
          style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
          {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
        </button>
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
          {tab === "graph" && <GraphView />}
          {tab === "heatmap" && <HeatmapView />}
          {tab === "charts" && <ChartsView />}
          {tab === "accounts" && <Accounts />}
        </Suspense>
      </main>
    </div>
  );
}
