import { useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";

// Ready-to-run queries. The backend schema (graphql_api.SDL) exposes: nodes(...), edges(limit),
// count(type). Node fields: key label type size repoId author project organization aiAgent.
const PRESETS: { name: string; query: string }[] = [
  { name: "Node counts", query: `{
  accounts: count(type: "account")
  repos: count(type: "repo")
  branches: count(type: "branch")
  prs: count(type: "pr")
  commits: count(type: "commit")
  total: count
}` },
  { name: "All repos (by size)", query: `{
  nodes(type: "repo", limit: 100) {
    key label size project organization
  }
}` },
  { name: "Pull requests", query: `{
  nodes(type: "pr") { key label repoId project }
}` },
  { name: "AI-authored commits", query: `# commit nodes are read live from the DB — no need to focus a repo first
{
  nodes(type: "commit", aiOnly: true, limit: 50) { key label author aiAgent }
  aiCommits: count(type: "commit", aiOnly: true)
}` },
  { name: "Search by name", query: `{
  nodes(search: "api") { key label type project }
}` },
  { name: "Edges", query: `{
  edges(limit: 200) { source target }
}` },
];

// Mirrors graphql_api.SDL so users see what they can select without an introspection round-trip.
const FIELDS: { type: string; fields: string }[] = [
  { type: "Query", fields: "nodes(type, author, project, organization, aiAgent, repoId, search, limit)  ·  edges(limit)  ·  count(type)" },
  { type: "Node", fields: "key  label  type  size  repoId  author  project  organization  aiAgent" },
  { type: "Edge", fields: "key  source  target" },
];

const DEFAULT = PRESETS[1].query;

// Pull node `key`s out of an arbitrary GraphQL result so we can filter the canvas to them.
function keysFromResult(data: any): string[] {
  const keys = new Set<string>();
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if (typeof v.key === "string") keys.add(v.key);
      if (typeof v.source === "string") keys.add(v.source);
      if (typeof v.target === "string") keys.add(v.target);
      Object.values(v).forEach(walk);
    }
  };
  walk(data);
  return [...keys];
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

export default function GraphQLPane({ provider, repoId, nodeKeys, onApply, applied }: {
  provider?: string; repoId?: number; nodeKeys: Set<string>;
  onApply: (keys: string[] | null) => void; applied: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(DEFAULT);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [lastKeys, setLastKeys] = useState<string[]>([]);
  const [showFields, setShowFields] = useState(false);

  // Only keys of nodes actually drawn on the canvas can be reflected there.
  const onCanvas = lastKeys.filter((k) => nodeKeys.has(k));

  const run = async () => {
    setRunning(true); setError(""); setResult("");
    try {
      const r = await api.graphql(query, provider, repoId);
      if (r.errors?.length) setError(r.errors.map((e) => e.message).join("\n"));
      setResult(JSON.stringify(r.data, null, 2));
      setLastKeys(keysFromResult(r.data));
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  const btn: React.CSSProperties = { padding: "4px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--fg)", fontSize: 12, cursor: "pointer" };

  return (
    <div style={{ borderBottom: "1px solid var(--border)", background: "var(--panel)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px" }}>
        <button onClick={() => setOpen((o) => !o)} className="btn" style={{ ...btn, fontWeight: 600 }}>
          {open ? "▾" : "▸"} {t("GraphQL query")}
        </button>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          {t("deep-dive & filter the graph with GraphQL")}
        </span>
        {applied && (
          <button onClick={() => onApply(null)} style={{ ...btn, marginLeft: "auto", borderColor: "var(--accent)", color: "var(--accent)" }}>
            {t("Clear graph filter")} ✕
          </button>
        )}
      </div>

      {open && (
        <div style={{ padding: "0 12px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              <span style={{ color: "var(--muted)", fontSize: 11, alignSelf: "center", marginRight: 2 }}>{t("Snippets")}:</span>
              {PRESETS.map((p) => (
                <button key={p.name} style={btn} onClick={() => { setQuery(p.query); setError(""); setResult(""); }}>{t(p.name)}</button>
              ))}
            </div>
            <textarea value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }}
              style={{ minHeight: 150, fontFamily: mono, fontSize: 12, padding: 8, borderRadius: 6,
                border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={run} disabled={running} style={{ ...btn, background: "var(--accent)", color: "#fff", borderColor: "var(--accent)", fontWeight: 600 }}>
                {running ? t("Running…") : `${t("Run")} ▶`}
              </button>
              <button style={btn} disabled={!onCanvas.length} onClick={() => onApply(onCanvas)}
                title={lastKeys.length && !onCanvas.length ? t("none of these results are drawn on the canvas") : ""}>
                {t("Apply to graph")} {onCanvas.length ? `(${onCanvas.length})` : ""}
              </button>
              <span style={{ color: "var(--muted)", fontSize: 11 }}>{t("⌘/Ctrl+Enter to run")}</span>
              <button style={{ ...btn, marginLeft: "auto" }} onClick={() => setShowFields((s) => !s)}>
                {showFields ? t("Hide fields") : t("Available fields")}
              </button>
            </div>
            {lastKeys.length > 0 && onCanvas.length === 0 && (
              <div style={{ color: "#d29922", fontSize: 11 }}>
                {lastKeys.length} {t("result nodes, none on the canvas — commit nodes appear only when you focus their repo (click it). Counts & off-canvas results still show in the panel →")}
              </div>
            )}
            {showFields && (
              <div style={{ fontFamily: mono, fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
                {FIELDS.map((f) => (
                  <div key={f.type}><span style={{ color: "var(--accent)" }}>{f.type}</span>: {f.fields}</div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            {error && <pre style={{ margin: 0, color: "#f85149", fontFamily: mono, fontSize: 12, whiteSpace: "pre-wrap" }}>{error}</pre>}
            <pre style={{ margin: 0, flex: 1, overflow: "auto", maxHeight: 220, fontFamily: mono, fontSize: 12,
              padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)" }}>
              {result || t("// results appear here — Run a query, then \"Apply to graph\" to filter the canvas to matching nodes")}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
