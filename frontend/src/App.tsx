import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api";
import { useSettings, setSettings } from "./settings";
import { useT } from "./i18n";

const GraphView = lazy(() => import("./views/GraphView"));
const HeatmapView = lazy(() => import("./views/HeatmapView"));
const StatsView = lazy(() => import("./views/StatsView"));
const ContributorsView = lazy(() => import("./views/ContributorsView"));
const Settings = lazy(() => import("./views/Settings"));
const Onboarding = lazy(() => import("./views/Onboarding"));

type Tab = "graph" | "heatmap" | "stats" | "contributors" | "settings";
const TABS: [Tab, string][] = [
  ["graph", "Network Graph"],
  ["heatmap", "Contribution Heatmap"],
  ["stats", "Stats"],
  ["contributors", "Contributors"],
  ["settings", "Settings"],
];

export default function App() {
  const s = useSettings();
  const t = useT();
  const [tab, setTab] = useState<Tab>(s.landingTab);
  const [onboard, setOnboard] = useState(false);

  // Theme + accent are driven by the settings store (the Settings page is the source of truth).
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
    document.documentElement.style.setProperty("--accent", s.accent);
  }, [s.theme, s.accent]);

  // First run: no accounts yet → show the welcome wizard.
  useEffect(() => {
    api.accounts().then((a) => { if (a.length === 0) setOnboard(true); }).catch(() => {});
  }, []);

  if (onboard)
    return (
      <div style={{ height: "100vh", overflow: "auto", background: "var(--bg)", color: "var(--fg)" }}>
        <Suspense fallback={<div style={{ padding: 40 }}>{t("Loading…")}</div>}>
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
              style={{ padding: "6px 12px", color: tab === id ? "#fff" : "var(--muted)" }}>{t(label)}</button>
          ))}
        </nav>
        <button onClick={() => setOnboard(true)} className="btn" style={{ marginLeft: "auto", color: "var(--muted)", padding: "6px 12px" }}>
          ＋ {t("Add account")}
        </button>
        <button onClick={() => setSettings({ theme: s.theme === "dark" ? "light" : "dark" })} title={t("Toggle theme")}
          className="btn" style={{ color: "var(--muted)", padding: "6px 12px" }}>
          {s.theme === "dark" ? `🌙 ${t("Dark")}` : `☀️ ${t("Light")}`}
        </button>
      </header>
      <main style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <Suspense fallback={<div style={{ padding: 40 }}>{t("Loading…")}</div>}>
          {tab === "graph" && <GraphView />}
          {tab === "heatmap" && <HeatmapView />}
          {tab === "stats" && <StatsView />}
          {tab === "contributors" && <ContributorsView />}
          {tab === "settings" && <Settings />}
        </Suspense>
      </main>
    </div>
  );
}
