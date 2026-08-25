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
        <button onClick={() => setTab(s.landingTab)} title={t("Home")}
          style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}>
          {/* Same mark as the GitHub Pages site (docs/index.html brand + favicon). */}
          <svg width="28" height="28" viewBox="0 0 64 64" fill="none" aria-hidden>
            <defs><linearGradient id="cg-logo" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
              <stop stopColor="#58a6ff" /><stop offset="1" stopColor="#8957e5" />
            </linearGradient></defs>
            <g stroke="url(#cg-logo)" strokeWidth="2.4" opacity=".85">
              <line x1="32" y1="32" x2="16" y2="16" /><line x1="32" y1="32" x2="48" y2="18" />
              <line x1="32" y1="32" x2="18" y2="48" /><line x1="32" y1="32" x2="49" y2="46" />
            </g>
            <g fill="url(#cg-logo)">
              <circle cx="32" cy="32" r="7" /><circle cx="16" cy="16" r="4.5" /><circle cx="48" cy="18" r="4.5" />
              <circle cx="18" cy="48" r="4.5" /><circle cx="49" cy="46" r="4.5" />
            </g>
          </svg>
          <strong style={{ fontSize: 18 }}>
            commit-graph
            <span style={{ background: "linear-gradient(90deg,#58a6ff,#8957e5)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>er</span>
          </strong>
        </button>
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
