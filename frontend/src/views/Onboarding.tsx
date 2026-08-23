import { useState } from "react";
import { api } from "../api";
import { logoUrl, PROVIDERS, ProviderMeta } from "../providers";
import { useT } from "../i18n";

const box: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--panel)", color: "var(--fg)",
};

// Brand logo with a colored-initial fallback if the icon CDN is unavailable.
function Logo({ p, size = 32 }: { p: ProviderMeta; size?: number }) {
  const theme = document.documentElement.dataset.theme || "dark";
  const [failed, setFailed] = useState(false);
  if (failed)
    return <span style={{ width: size, height: size, borderRadius: 8, background: p.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.5 }}>{p.name[0]}</span>;
  return <img src={logoUrl(p.slug, theme)} alt={p.name} width={size} height={size} onError={() => setFailed(true)} />;
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [picked, setPicked] = useState<ProviderMeta | null>(null);
  const [form, setForm] = useState({ username: "", token: "", owner_url: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);  // username of last connected account

  const connect = async () => {
    if (!picked) return;
    setBusy(true); setMsg(null);
    try {
      const { id } = await api.addAccount({ provider: picked.id, username: form.username, token: form.token, owner_url: form.owner_url || undefined });
      setMsg("Syncing… this can take a moment for large accounts.");
      await api.sync(id);
      setDone(form.username);
      setForm({ username: "", token: "", owner_url: "" });
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };

  const addAnother = () => { setDone(null); setPicked(null); setMsg(null); };

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ width: 720, maxWidth: "100%" }}>
        <h1 style={{ marginBottom: 4 }}>
          {t("Welcome to")} <span style={{ color: "var(--accent)" }}>commit-graph</span><span style={{ color: "var(--accent2)" }}>er</span>
        </h1>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          {t("Connect one or more version-control accounts to see your commits as an interactive graph, heatmap and charts.")}{" "}
          {t("Only metadata is read — your code is never cloned. Tokens stay in your OS keychain.")}
        </p>

        {done ? (
          <div style={{ padding: 20, border: "1px solid #238636", borderRadius: 10, background: "var(--panel)" }}>
            <h3 style={{ marginTop: 0 }}>✓ {t("Connected {name}", { name: done })}</h3>
            <p style={{ color: "var(--muted)" }}>{t("You can add several accounts (even multiple GitHub users / orgs).")}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={addAnother} style={{ ...box, width: "auto", cursor: "pointer" }}>+ {t("Add another account")}</button>
              <button onClick={onDone} style={{ ...box, width: "auto", background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" }}>{t("Go to the app →")}</button>
            </div>
          </div>
        ) : !picked ? (
          <>
            <h3>1 · {t("Choose a provider")}</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {PROVIDERS.map((p) => (
                <button key={p.id} onClick={() => { setPicked(p); setMsg(null); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 18, borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--fg)", cursor: "pointer", borderTop: `3px solid ${p.color}` }}>
                  <Logo p={p} />
                  <b>{p.name}</b>
                  <span style={{ fontSize: 11, color: p.supported ? "#3fb950" : "var(--muted)" }}>{p.supported ? `✓ ${t("ready")}` : t("preview")}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Logo p={picked} size={24} />
              <h3 style={{ margin: 0 }}>2 · {t("Connect {name}", { name: picked.name })}</h3>
              <button onClick={() => setPicked(null)} style={{ ...box, width: "auto", padding: "4px 10px", cursor: "pointer" }}>← {t("back")}</button>
            </div>
            <ol style={{ color: "var(--muted)", lineHeight: 1.6 }}>{picked.steps.map((s, i) => <li key={i}>{t(s)}</li>)}</ol>
            {picked.tokenUrl !== "#" && (
              <a href={picked.tokenUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{t("→ Open {name} token page (scopes: {scopes})", { name: picked.name, scopes: picked.scopes })}</a>
            )}
            <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
              <input style={box} placeholder={picked.usernameLabel} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              <input style={box} type="password" placeholder={t("personal access token")} value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
              <input style={box} placeholder={`owner_url (optional) — ${picked.ownerHint}`} value={form.owner_url} onChange={(e) => setForm({ ...form, owner_url: e.target.value })} />
              <button disabled={busy || !form.username || !form.token} onClick={connect} style={{ ...box, background: "#238636", color: "#fff", border: "none", cursor: "pointer" }}>
                {busy ? t("Connecting…") : t("Connect & sync {name}", { name: picked.name })}
              </button>
              {!picked.supported && <div style={{ color: "#d29922", fontSize: 12 }}>{t("Note: {name} adapter is a preview — sync may not work yet.", { name: picked.name })}</div>}
            </div>
          </>
        )}

        {msg && <div style={{ marginTop: 14, color: "var(--accent)" }}>{msg}</div>}
        {!done && <div style={{ marginTop: 24 }}>
          <button onClick={onDone} style={{ background: "transparent", color: "var(--muted)", border: "none", cursor: "pointer", textDecoration: "underline" }}>{t("Skip for now")}</button>
        </div>}
      </div>
    </div>
  );
}
