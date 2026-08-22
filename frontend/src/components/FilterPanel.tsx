import { ReactNode, useState } from "react";
import MultiSelect, { Opt } from "./MultiSelect";

export interface FilterDim {
  key: string;
  label: string;
  options: Opt[];
  selected: Set<string | number>;
  onChange: (s: Set<string | number>) => void;
  placeholder?: string;
  single?: boolean;
}

export interface DateRange {
  start: string; end: string;
  setStart: (v: string) => void; setEnd: (v: string) => void;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// The one collapsible left filter panel shared by every page. Pages supply their
// dimensions (MultiSelects) plus optional date-range, active-filter chips, and
// page-specific `extra`/`footer` slots (e.g. the graph's node-type toggles).
export default function FilterPanel({
  dims, open, onOpenChange, title = "Filters", activeCount, chips, onClear,
  dateRange, extra, footer, width, onWidthChange,
}: {
  dims: FilterDim[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  activeCount: number;
  chips?: { label: string; rm: () => void }[];
  onClear?: () => void;
  dateRange?: DateRange;
  extra?: ReactNode;
  footer?: ReactNode;
  width?: number;                       // set (with onWidthChange) only for the resizable graph panel
  onWidthChange?: (w: number) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const preset = (days: number | null) => {
    if (!dateRange) return;
    if (days == null) { dateRange.setStart(""); dateRange.setEnd(""); return; }
    const now = new Date();
    dateRange.setStart(iso(new Date(now.getTime() - days * 86400000)));
    dateRange.setEnd(iso(now));
  };

  if (!open) {
    return (
      <button className="btn" style={{ alignSelf: "flex-start", margin: 8 }} onClick={() => onOpenChange(true)}>
        ▶ {title}{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>
    );
  }

  return (
    <aside className="filter-panel" style={onWidthChange ? { width, flex: `0 0 ${width}px`, position: "relative" } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <b>{title} {activeCount > 0 && <span className="pill">{activeCount}</span>}</b>
        <button className="btn" style={{ padding: "2px 8px" }} title="collapse" onClick={() => onOpenChange(false)}>◀</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {dims.map((d) => (
          <div key={d.key}>
            <div className="field-label">{d.label}</div>
            <MultiSelect options={d.options} selected={d.selected} onChange={d.onChange}
              placeholder={d.placeholder} single={d.single}
              open={openKey === d.key} onOpenChange={(o) => setOpenKey(o ? d.key : null)} />
          </div>
        ))}

        {dateRange && (
          <div>
            <div className="field-label">Date range</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input type="date" className="cg-input" value={dateRange.start} max={dateRange.end || undefined} onChange={(e) => dateRange.setStart(e.target.value)} />
              <input type="date" className="cg-input" value={dateRange.end} min={dateRange.start || undefined} onChange={(e) => dateRange.setEnd(e.target.value)} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["30d", 30], ["90d", 90], ["1y", 365], ["All", null]].map(([lbl, d]) => (
                  <button key={lbl as string} className="chip" onClick={() => preset(d as number | null)}>{lbl}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {extra}

        {chips && chips.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>ACTIVE</span>
              {onClear && <a onClick={onClear} style={{ color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>clear all</a>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {chips.map((c, i) => (
                <span key={i} className="chip" onClick={c.rm} title="remove filter">{c.label} <span className="x">✕</span></span>
              ))}
            </div>
          </div>
        )}

        {footer}
      </div>

      {onWidthChange && (
        <div onMouseDown={(e) => {
          const startX = e.clientX, startW = width || 260;
          const move = (ev: MouseEvent) => onWidthChange(Math.max(220, Math.min(560, startW + ev.clientX - startX)));
          const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
          window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
        }} style={{ position: "absolute", top: 0, right: 0, width: 6, height: "100%", cursor: "col-resize" }} />
      )}
    </aside>
  );
}
