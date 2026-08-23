import { ReactNode, useState } from "react";
import MultiSelect, { Opt } from "./MultiSelect";
import { APP_VERSION, REPO_URL, AUTHOR_URL } from "../version";
import { useT } from "../i18n";

// GitHub mark (inline so there's no icon dependency).
const GitHubMark = () => (
  <svg height="14" width="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
  </svg>
);

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
  const t = useT();

  // Date-range quick presets. Filtering is day-granular, so 1h/1d both resolve to "today".
  const PRESETS: [string, number | null][] = [
    ["1h", 0], ["1d", 1], ["1w", 7], ["30d", 30], ["90d", 90], ["1y", 365], ["All", null],
  ];
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
        ▶ {t(title)}{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>
    );
  }

  return (
    <aside className="filter-panel"
      style={onWidthChange ? { width, flex: `0 0 ${width}px`, position: "relative", maxHeight: "100%", overflowY: "auto" } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <b>{t(title)} {activeCount > 0 && <span className="pill">{activeCount}</span>}</b>
        <button className="btn" style={{ padding: "2px 8px" }} title={t("collapse")} onClick={() => onOpenChange(false)}>◀</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {dims.map((d) => (
          <div key={d.key}>
            <div className="field-label">{t(d.label)}</div>
            <MultiSelect options={d.options} selected={d.selected} onChange={d.onChange}
              placeholder={d.placeholder ? t(d.placeholder) : undefined} single={d.single}
              open={openKey === d.key} onOpenChange={(o) => setOpenKey(o ? d.key : null)} />
          </div>
        ))}

        {dateRange && (
          <div>
            <div className="field-label">{t("Date range")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input type="date" className="cg-input" value={dateRange.start} max={dateRange.end || undefined} onChange={(e) => dateRange.setStart(e.target.value)} />
              <input type="date" className="cg-input" value={dateRange.end} min={dateRange.start || undefined} onChange={(e) => dateRange.setEnd(e.target.value)} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PRESETS.map(([lbl, d]) => (
                  <button key={lbl} className="chip" onClick={() => preset(d)}>{t(lbl)}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {extra}

        {chips && chips.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{t("ACTIVE")}</span>
              {onClear && <a onClick={onClear} style={{ color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>{t("clear all")}</a>}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {chips.map((c, i) => (
                <span key={i} className="chip" onClick={c.rm} title={t("remove filter")}>{c.label} <span className="x">✕</span></span>
              ))}
            </div>
          </div>
        )}

        {footer}
      </div>

      {/* App credit — pinned to the bottom of the (full-height) panel on every page. */}
      <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 11, color: "var(--muted)" }}>
        <span><b style={{ color: "var(--fg)", fontWeight: 600 }}>commit-graph<span style={{ color: "var(--accent2)" }}>er</span></b> v{APP_VERSION}</span>
        <span>·</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer" title="GitHub repository" aria-label="GitHub repository" style={{ display: "inline-flex", color: "var(--muted)" }}><GitHubMark /></a>
        <span>·</span>
        <span>by <a href={AUTHOR_URL} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>FXerkan</a></span>
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
