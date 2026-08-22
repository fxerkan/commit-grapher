import { useEffect, useState } from "react";
import { Account, api } from "../api";

const PROVIDERS = ["github", "azure", "gitlab", "bitbucket", "gitea", "codeberg"];
const input: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--panel)", color: "var(--fg)",
};

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({ provider: "github", username: "", token: "", owner_url: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => api.accounts().then(setAccounts).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const add = async () => {
    setBusy("add"); setMsg(null);
    try {
      await api.addAccount({
        provider: form.provider, username: form.username, token: form.token,
        owner_url: form.owner_url || undefined,
      });
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

  const del = async (id: number) => { await api.deleteAccount(id); await load(); };

  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const saveName = async (id: number) => { await api.renameAccount(id, editVal.trim()); setEditId(null); await load(); };

  // GitHub OAuth device flow (no PAT needed; pulls private repos with the 'repo' scope).
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

  return (
    <div style={{ padding: 24, maxWidth: 820 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <label style={{ ...input, color: "var(--accent)", cursor: "pointer" }}>
          ⬆ Import (JSON)
          <input type="file" accept="application/json,.json" style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              try {
                const c = await api.importData(JSON.parse(await f.text()));
                setMsg(`Imported: ${c.accounts} accounts, ${c.repos} repos, ${c.commits} commits`);
                await load();
              } catch (err: any) { setMsg(err.message); }
              e.target.value = "";
            }} />
        </label>
        <a href="/api/export" download="commit-grapher-export.json"
          style={{ ...input, textDecoration: "none", color: "var(--accent)", cursor: "pointer" }}>
          ⬇ Export all data (JSON)
        </a>
      </div>
      <h3>Add a version-control account</h3>
      <p style={{ color: "#8b949e", marginTop: -6 }}>
        The Personal Access Token is stored in your OS keychain — never written to disk in plaintext.
        Only git metadata is read (no code is cloned).
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select style={input} value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
          {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input style={input} placeholder="username / org" value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input style={{ ...input, width: 240 }} type="password" placeholder="personal access token" value={form.token}
          onChange={(e) => setForm({ ...form, token: e.target.value })} />
        <input style={{ ...input, width: 260 }} placeholder="owner_url (optional; e.g. Azure/Gitea)" value={form.owner_url}
          onChange={(e) => setForm({ ...form, owner_url: e.target.value })} />
        <button className="btn btn-primary" disabled={busy === "add" || !form.username || !form.token} onClick={add}
          style={{ padding: "8px 16px" }}>
          {busy === "add" ? "Adding…" : "Add"}
        </button>
      </div>

      {msg && <div style={{ marginTop: 16, color: "#58a6ff" }}>{msg}</div>}

      <h3 style={{ marginTop: 28 }}>…or log in with GitHub (OAuth, no PAT)</h3>
      <p style={{ color: "#8b949e", marginTop: -6 }}>
        One-time setup: create a GitHub OAuth App with <b>Enable Device Flow</b> checked, paste its Client ID here.
        This grants the <code>repo</code> scope so your <b>private</b> repos are included too.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input style={{ ...input, width: 320 }} placeholder="GitHub OAuth App Client ID (Iv1.… / Ov23…)"
          value={clientId} onChange={(e) => setClientId(e.target.value)} />
        <button className="btn btn-accent2" disabled={!clientId.trim() || !!device} onClick={oauthLogin}
          style={{ padding: "8px 16px" }}>
          Login with GitHub
        </button>
      </div>
      {device && (
        <div className="panel" style={{ marginTop: 12 }}>
          Go to <a href={device.verification_uri} target="_blank" rel="noreferrer" style={{ color: "#58a6ff" }}>{device.verification_uri}</a>{" "}
          and enter code: <code style={{ fontSize: 18, letterSpacing: 2, color: "#39d353" }}>{device.user_code}</code>
          <div style={{ color: "#8b949e", fontSize: 12, marginTop: 4 }}>Waiting for authorization… (this box closes when done)</div>
        </div>
      )}

      <h3 style={{ marginTop: 32 }}>Accounts</h3>
      {accounts.length === 0 && <div style={{ color: "#8b949e" }}>None yet.</div>}
      {accounts.map((a) => (
        <div key={a.id} className="panel" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ flex: 1 }}>
            {editId === a.id ? (
              <span style={{ display: "inline-flex", gap: 6 }}>
                <input autoFocus style={{ ...input, padding: "4px 8px" }} value={editVal} placeholder={a.username}
                  onChange={(e) => setEditVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName(a.id)} />
                <button className="btn" onClick={() => saveName(a.id)} style={{ padding: "4px 10px", color: "var(--accent)" }}>save</button>
                <button className="btn" onClick={() => setEditId(null)} style={{ padding: "4px 10px", color: "var(--muted)" }}>✕</button>
              </span>
            ) : (
              <>
                <b>{a.display_name || a.username}</b> <span style={{ color: "#8b949e" }}>({a.provider})</span>
                <button title="rename" onClick={() => { setEditId(a.id); setEditVal(a.display_name || ""); }}
                  style={{ marginLeft: 6, background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}>✎</button>
                {a.last_synced_at && <span style={{ color: "#8b949e", marginLeft: 8, fontSize: 12 }}>synced {a.last_synced_at.slice(0, 10)}</span>}
              </>
            )}
          </span>
          <button className="btn btn-primary" disabled={busy === `sync${a.id}`} onClick={() => sync(a.id)} style={{ padding: "6px 12px" }}>
            {busy === `sync${a.id}` ? "Syncing…" : "Sync"}
          </button>
          <button className="btn btn-danger" onClick={() => del(a.id)} style={{ padding: "6px 12px" }}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
