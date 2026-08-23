import { useEffect, useState } from "react";
import { Account, api } from "../api";
import {
  ALL_NODE_TYPES, AppSettings, NodeType, Physics, useSettings, setSettings, resetSettings, DEFAULTS,
} from "../settings";
import { t, LANGS } from "../i18n";

const PROVIDERS = ["github", "azure", "gitlab", "bitbucket", "gitea", "codeberg", "jira"];
const NODE_LABEL: Record<NodeType, string> = {
  account: "Accounts", repo: "Repos", branch: "Branches", pr: "PRs", commit: "Commits", workitem: "Work items",
};
const input: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--panel)", color: "var(--fg)",
};

// ---- small building blocks -------------------------------------------------
function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 2px" }}>{t(title)}</h3>
      {desc && <p style={{ color: "var(--muted)", margin: "0 0 14px", fontSize: 13 }}>{t(desc)}</p>}
      {children}
    </section>
  );
}
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{t(label)}</div>
        {hint && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{t(hint)}</div>}
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 8 }}>{children}</div>
    </div>
  );
}
function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className="btn"
          style={{ borderRadius: 0, border: "none", padding: "6px 12px", fontSize: 13,
            background: v === value ? "var(--accent)" : "transparent", color: v === value ? "#fff" : "var(--muted)" }}>
          {label}
        </button>
      ))}
    </div>
  );
}
function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on}
      style={{ width: 42, height: 24, borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer",
        background: on ? "var(--accent)" : "var(--panel)", position: "relative", transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: "50%",
        background: "#fff", transition: "left .15s" }} />
    </button>
  );
}
function Slider({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ accentColor: "var(--accent)", width: 160 }} />
      <span style={{ width: 38, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--muted)", fontSize: 13 }}>{value}</span>
    </span>
  );
}

// ---- page ------------------------------------------------------------------
export default function Settings() {
  const s = useSettings();
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setSettings({ [k]: v } as Partial<AppSettings>);

  // accounts
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ provider: "github", username: "", token: "", owner_url: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api.accounts().then(setAccounts).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const add = async () => {
    setBusy("add"); setMsg(null);
    try {
      await api.addAccount({ provider: form.provider, username: form.username, token: form.token, owner_url: form.owner_url || undefined });
      setForm({ ...form, username: "", token: "", owner_url: "" });
      await load();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(null); }
  };
  const sync = async (id: number) => {
    setBusy(`sync${id}`); setMsg(null);
    try {
      const c = await api.sync(id);
      const skipped = c.errors?.length ? ` (${c.errors.length} repos skipped)` : "";
      setMsg(`Synced: ${c.repos} repos, ${c.branches} branches, ${c.pull_requests} PRs, ${c.commits} commits${skipped}`);
      await load();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(null); }
  };
  const del = async (id: number) => { if (confirm(t("Remove this account and its cached data?"))) { await api.deleteAccount(id); await load(); } };
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const saveName = async (id: number) => { await api.renameAccount(id, editVal.trim()); setEditId(null); await load(); };

  // GitHub OAuth device flow
  const [clientId, setClientId] = useState(localStorage.getItem("gh_client_id") || "");
  const [device, setDevice] = useState<{ user_code: string; verification_uri: string; device_code: string; interval: number } | null>(null);
  const oauthLogin = async () => {
    setMsg(null);
    try {
      localStorage.setItem("gh_client_id", clientId.trim());
      const d = await api.oauthStart(clientId.trim());
      setDevice(d);
      const poll = async () => {
        try {
          const r = await api.oauthPoll(clientId.trim(), d.device_code);
          if (r.status === "done") { setDevice(null); setMsg(`Logged in as ${r.username} — now click Sync`); await load(); return; }
        } catch (e: any) { setDevice(null); setMsg(e.message); return; }
        setTimeout(poll, (d.interval || 5) * 1000);
      };
      setTimeout(poll, (d.interval || 5) * 1000);
    } catch (e: any) { setMsg(e.message); }
  };

  const toggleNodeType = (t: NodeType) => {
    const has = s.defaultNodeTypes.includes(t);
    set("defaultNodeTypes", (has ? s.defaultNodeTypes.filter((x) => x !== t) : [...s.defaultNodeTypes, t]) as NodeType[]);
  };

  // Share: download the current network as a graphology snapshot (the format the Pages hero uses).
  const [sharing, setSharing] = useState(false);
  const shareSnapshot = async () => {
    setSharing(true); setMsg(null);
    try {
      const g = await api.graph();
      const blob = new Blob([JSON.stringify(g)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "public-graph.json"; a.click();
      URL.revokeObjectURL(url);
      setMsg(`Snapshot: ${g.nodes.length} nodes, ${g.edges.length} edges. Review for private names before publishing to a public site.`);
    } catch (e: any) { setMsg(e.message); } finally { setSharing(false); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 880, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{t("Settings")}</h2>
        <button className="btn" onClick={() => { if (confirm(t("Reset all preferences to defaults? (accounts are kept)"))) resetSettings(); }}
          style={{ marginLeft: "auto", padding: "6px 12px", color: "var(--muted)" }}>{t("Reset to defaults")}</button>
      </div>

      {msg && <div className="panel" style={{ padding: "10px 14px", marginBottom: 16, color: "var(--accent)" }}>{msg}</div>}

      <Section title="General" desc="Appearance and what you see first.">
        <Row label="Interface language">
          <select style={input} value={s.language} onChange={(e) => set("language", e.target.value as any)}>
            {LANGS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </Row>
        <Row label="Theme">
          <Seg value={s.theme} onChange={(v) => set("theme", v)} options={[["dark", `🌙 ${t("Dark")}`], ["light", `☀️ ${t("Light")}`]]} />
        </Row>
        <Row label="Accent color" hint="Used across buttons, links and highlights.">
          <input type="color" value={s.accent} onChange={(e) => set("accent", e.target.value)}
            style={{ width: 40, height: 28, background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }} />
          <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => set("accent", DEFAULTS.accent)}>{t("reset")}</button>
        </Row>
        <Row label="Open on launch" hint="Which view loads when you start the app.">
          <select style={input} value={s.landingTab} onChange={(e) => set("landingTab", e.target.value as any)}>
            <option value="graph">{t("Network Graph")}</option>
            <option value="heatmap">{t("Contribution Heatmap")}</option>
            <option value="stats">{t("Stats")}</option>
            <option value="contributors">{t("Contributors")}</option>
          </select>
        </Row>
      </Section>

      <Section title="Network graph — layout & animation" desc="Physics of the force-directed layout. Changes apply on the next graph load or filter change.">
        <Row label="Animation level" hint="How hard ForceAtlas2 works. Off keeps a fast static spread; High is prettiest but heavier.">
          <Seg<Physics> value={s.physics} onChange={(v) => set("physics", v)}
            options={[["off", t("Off")], ["low", t("Low")], ["balanced", t("Balanced")], ["high", t("High")]]} />
        </Row>
        <Row label="Gravity" hint="Higher pulls nodes toward the center (tighter clusters).">
          <Slider value={s.gravity} min={0} max={5} step={0.5} onChange={(v) => set("gravity", v)} />
        </Row>
        <Row label="Node spread" hint="ForceAtlas2 scaling ratio — higher spreads nodes farther apart.">
          <Slider value={s.scaling} min={5} max={80} step={5} onChange={(v) => set("scaling", v)} />
        </Row>
        <Row label="Label density" hint="Lower shows more labels at once; higher declutters.">
          <Slider value={s.labelDensity} min={1} max={16} step={1} onChange={(v) => set("labelDensity", v)} />
        </Row>
        <Row label="Relationship arrows" hint="Draw directed arrows on edges by default.">
          <Switch on={s.showArrows} onChange={(v) => set("showArrows", v)} />
        </Row>
        <Row label="Node types shown by default" hint="Which node kinds are visible when the graph opens.">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {ALL_NODE_TYPES.map((nt) => (
              <label key={nt} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--fg)" }}>
                <input type="checkbox" checked={s.defaultNodeTypes.includes(nt)} onChange={() => toggleNodeType(nt)} />{t(NODE_LABEL[nt])}
              </label>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Default filters" desc="How the network graph is pre-filtered each time it opens.">
        <Row label="Default provider">
          <select style={input} value={s.defaultProvider} onChange={(e) => set("defaultProvider", e.target.value)}>
            <option value="">{t("All providers")}</option>
            {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Row>
        <Row label="Authorship" hint="Show everyone, only humans, or only AI-agent commits.">
          <Seg value={s.defaultHumanAI} onChange={(v) => set("defaultHumanAI", v)}
            options={[["all", t("All")], ["human", t("Humans")], ["ai", t("AI")]]} />
        </Row>
        <Row label="Only my activity" hint="Highlight only commits by your names below.">
          <Switch on={s.defaultOnlyMine} onChange={(v) => set("defaultOnlyMine", v)} />
        </Row>
        <Row label="My names / emails" hint="Comma-separated — used by ‘only my activity’ and to gild your nodes.">
          <input style={{ ...input, width: 260 }} placeholder="Erkan Çiftçi, fxerkan, me@x.com"
            value={s.myNames} onChange={(e) => set("myNames", e.target.value)} />
        </Row>
      </Section>

      <Section title="Fun facts" desc="Playful stats derived from your history.">
        <Row label="Show fun facts on the Stats page" hint="Night-owl commits, longest streak, busiest day, and friends.">
          <Switch on={s.showFacts} onChange={(v) => set("showFacts", v)} />
        </Row>
      </Section>

      <Section title="Accounts" desc="Connect version-control and issue platforms. Tokens live in your OS keychain — never on disk, only git metadata is read.">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 8 }}>
          <select style={input} value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
            {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input style={input} placeholder={t("username / org / email")} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input style={{ ...input, width: 220 }} type="password" placeholder={t("access token")} value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
          <input style={{ ...input, width: 240 }} placeholder={t("owner_url (Azure/Jira/Bitbucket/self-hosted)")} value={form.owner_url} onChange={(e) => setForm({ ...form, owner_url: e.target.value })} />
          <button className="btn btn-primary" disabled={busy === "add" || !form.username || !form.token} onClick={add} style={{ padding: "8px 16px" }}>
            {busy === "add" ? t("Adding…") : t("Add")}
          </button>
        </div>

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: 13 }}>{t("…or log in with GitHub (OAuth device flow, no PAT)")}</summary>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <input style={{ ...input, width: 300 }} placeholder="GitHub OAuth App Client ID (Iv1.… / Ov23…)" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            <button className="btn btn-accent2" disabled={!clientId.trim() || !!device} onClick={oauthLogin} style={{ padding: "8px 16px" }}>{t("Login with GitHub")}</button>
          </div>
          {device && (
            <div className="panel" style={{ marginTop: 12 }}>
              Go to <a href={device.verification_uri} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{device.verification_uri}</a>{" "}
              and enter code: <code style={{ fontSize: 18, letterSpacing: 2, color: "#39d353" }}>{device.user_code}</code>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Waiting for authorization…</div>
            </div>
          )}
        </details>

        <div style={{ marginTop: 16 }}>
          {accounts.length === 0 && <div style={{ color: "var(--muted)" }}>{t("No accounts yet.")}</div>}
          {accounts.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                {editId === a.id ? (
                  <span style={{ display: "inline-flex", gap: 6 }}>
                    <input autoFocus style={{ ...input, padding: "4px 8px" }} value={editVal} placeholder={a.username}
                      onChange={(e) => setEditVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName(a.id)} />
                    <button className="btn" onClick={() => saveName(a.id)} style={{ padding: "4px 10px", color: "var(--accent)" }}>{t("save")}</button>
                    <button className="btn" onClick={() => setEditId(null)} style={{ padding: "4px 10px", color: "var(--muted)" }}>✕</button>
                  </span>
                ) : (
                  <>
                    <b>{a.display_name || a.username}</b> <span style={{ color: "var(--muted)" }}>({a.provider})</span>
                    <button title={t("rename")} onClick={() => { setEditId(a.id); setEditVal(a.display_name || ""); }}
                      style={{ marginLeft: 6, background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}>✎</button>
                    {a.last_synced_at && <span style={{ color: "var(--muted)", marginLeft: 8, fontSize: 12 }}>synced {a.last_synced_at.slice(0, 10)}</span>}
                  </>
                )}
              </span>
              <button className="btn btn-primary" disabled={busy === `sync${a.id}`} onClick={() => sync(a.id)} style={{ padding: "6px 12px" }}>
                {busy === `sync${a.id}` ? t("Syncing…") : t("Sync")}
              </button>
              <button className="btn btn-danger" onClick={() => del(a.id)} style={{ padding: "6px 12px" }}>{t("Delete")}</button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Data — import, export & share" desc="Everything is local. Move it between machines or publish a public snapshot.">
        <Row label="Export all data" hint="Full backup (accounts, repos, branches, PRs, commits) as JSON.">
          <a href="/api/export" download="commit-grapher-export.json" className="btn" style={{ textDecoration: "none", padding: "6px 12px", color: "var(--accent)" }}>⬇ {t("Export JSON")}</a>
        </Row>
        <Row label="Import data" hint="Merge a previously exported JSON backup.">
          <label className="btn" style={{ padding: "6px 12px", color: "var(--accent)", cursor: "pointer" }}>
            ⬆ {t("Import JSON")}
            <input type="file" accept="application/json,.json" style={{ display: "none" }}
              onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                try { const c = await api.importData(JSON.parse(await f.text())); setMsg(`Imported: ${c.accounts} accounts, ${c.repos} repos, ${c.commits} commits`); await load(); }
                catch (err: any) { setMsg(err.message); }
                e.target.value = "";
              }} />
          </label>
        </Row>
        <Row label="Share / publish snapshot" hint="Download a public-graph.json of your current network — the format the GitHub Pages hero renders.">
          <button className="btn btn-accent2" disabled={sharing} onClick={shareSnapshot} style={{ padding: "6px 12px" }}>
            {sharing ? t("Building…") : `⇧ ${t("Public snapshot")}`}
          </button>
        </Row>
      </Section>
    </div>
  );
}
