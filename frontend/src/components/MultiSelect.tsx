import { useEffect, useMemo, useRef, useState } from "react";

export interface Opt { key: string | number; label: string; count?: number; badge?: string; badgeColor?: string }

// Filterable, sortable, multi-selectable dropdown. Replaces native <select>.
export default function MultiSelect({
  options, selected, onChange, placeholder = "select…", single = false, open: openProp, onOpenChange,
}: {
  options: Opt[];
  selected: Set<string | number>;
  onChange: (next: Set<string | number>) => void;
  placeholder?: string;
  single?: boolean;
  open?: boolean;                          // controlled -> only one dropdown open at a time
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = (v: boolean | ((p: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(open) : v;
    onOpenChange ? onOpenChange(next) : setOpenState(next);
  };
  const [q, setQ] = useState("");
  const [sortByCount, setSortByCount] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking anywhere outside this dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const shown = useMemo(() => {
    let list = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
    list = [...list].sort((a, b) =>
      sortByCount && a.count != null && b.count != null ? b.count - a.count : a.label.localeCompare(b.label));
    return list.slice(0, 500);
  }, [options, q, sortByCount]);

  const toggle = (k: string | number) => {
    if (single) { onChange(selected.has(k) ? new Set() : new Set([k])); setOpen(false); return; }
    const s = new Set(selected); s.has(k) ? s.delete(k) : s.add(k); onChange(s);
  };

  const box: React.CSSProperties = { width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--fg)" };
  const summary = selected.size === 0 ? placeholder
    : single ? options.find((o) => selected.has(o.key))?.label || placeholder
    : `${selected.size} selected`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ ...box, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected.size ? "var(--fg)" : "var(--muted)" }}>{summary}</span>
        <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {selected.size > 0 && <span style={{ background: "var(--accent)", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px" }}>{selected.size}</span>}
          <span style={{ color: "var(--muted)" }}>{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 20, top: "100%", left: 0, right: 0, marginTop: 2, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, boxShadow: "0 6px 20px #0008" }}>
          <div style={{ display: "flex", gap: 4, padding: 4, borderBottom: "1px solid var(--border)" }}>
            <input autoFocus placeholder="filter…" value={q} onChange={(e) => setQ(e.target.value)}
              style={{ ...box, padding: "5px 8px", border: "1px solid var(--border)" }} />
            <button title="sort" onClick={() => setSortByCount((v) => !v)} style={{ ...box, width: "auto", padding: "4px 8px", cursor: "pointer" }}>{sortByCount ? "#" : "A"}</button>
          </div>
          {!single && (
            <div style={{ display: "flex", gap: 8, padding: "4px 8px", fontSize: 11, borderBottom: "1px solid var(--border)" }}>
              <a onClick={() => onChange(new Set(shown.map((o) => o.key)))} style={{ color: "var(--accent)", cursor: "pointer" }}>all shown</a>
              <a onClick={() => onChange(new Set())} style={{ color: "var(--muted)", cursor: "pointer" }}>clear</a>
            </div>
          )}
          <div style={{ maxHeight: 220, overflowY: "auto", padding: 4 }}>
            {shown.map((o) => (
              <label key={o.key} style={{ display: "flex", gap: 6, alignItems: "center", padding: "3px 6px", fontSize: 12, cursor: "pointer", borderRadius: 4 }}>
                <input type={single ? "radio" : "checkbox"} checked={selected.has(o.key)} onChange={() => toggle(o.key)} />
                {o.badge && <span style={{ fontSize: 9, padding: "0 5px", borderRadius: 8, background: o.badgeColor || "var(--border)", color: "#fff" }}>{o.badge}</span>}
                <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
                {o.count != null && <span style={{ color: "var(--muted)", fontSize: 11 }}>{o.count}</span>}
              </label>
            ))}
            {shown.length === 0 && <div style={{ padding: 8, color: "var(--muted)", fontSize: 12 }}>no matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}
