import { useMemo } from "react";
import { GitCommit } from "../api";

// Classic git-graph lane layout: assign each commit a column, then draw curved
// edges to its parents (first parent continues the lane; extra parents = merges).
const COLORS = ["#58a6ff", "#3fb950", "#bc8cff", "#f78166", "#d29922", "#db61a2", "#39d353", "#e3b341"];
const ROW = 34, GAP = 18, PAD = 12, R = 5;

interface Pos { col: number; row: number; color: string }

function layout(commits: GitCommit[]): Record<string, Pos> {
  const pos: Record<string, Pos> = {};
  const lanes: ({ sha: string; color: string } | null)[] = [];
  let ci = 0;
  const nextColor = () => COLORS[ci++ % COLORS.length];
  commits.forEach((c, row) => {
    let col = lanes.findIndex((l) => l && l.sha === c.sha);
    let color: string;
    if (col === -1) {
      col = lanes.findIndex((l) => !l);
      color = nextColor();
      if (col === -1) { col = lanes.length; lanes.push({ sha: c.sha, color }); }
      else lanes[col] = { sha: c.sha, color };
    } else color = lanes[col]!.color;
    pos[c.sha] = { col, row, color };

    const [p0, ...rest] = c.parents;
    lanes[col] = p0 ? { sha: p0, color } : null;
    rest.forEach((p) => {
      if (!lanes.some((l) => l && l.sha === p)) {
        const free = lanes.findIndex((l) => !l);
        const mc = nextColor();
        if (free === -1) lanes.push({ sha: p, color: mc });
        else lanes[free] = { sha: p, color: mc };
      }
    });
  });
  return pos;
}

const avatar = (seed: string) => `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;

export default function GitGraph({ commits }: { commits: GitCommit[] }) {
  const { pos, cols } = useMemo(() => {
    const p = layout(commits);
    const cols = Math.max(1, ...Object.values(p).map((v) => v.col + 1));
    return { pos: p, cols };
  }, [commits]);

  // Branch legend: each distinct branch -> a color (from its first commit's lane).
  const branches = useMemo(() => {
    const m = new Map<string, string>();
    commits.forEach((c) => { if (c.branch && !m.has(c.branch)) m.set(c.branch, pos[c.sha]?.color || "#888"); });
    return [...m.entries()];
  }, [commits, pos]);

  const svgW = cols * GAP + PAD;
  const height = commits.length * ROW + PAD;
  const cx = (col: number) => col * GAP + PAD;
  const cy = (row: number) => row * ROW + PAD + R;

  return (
   <div>
    {branches.length > 0 && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8, fontSize: 11 }}>
        {branches.slice(0, 12).map(([b, c]) => (
          <span key={b} style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--muted)" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: c }} /> {b}
          </span>
        ))}
      </div>
    )}
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <svg width={svgW} height={height} style={{ flexShrink: 0 }}>
        {commits.map((c) => {
          const a = pos[c.sha];
          return c.parents.map((p) => {
            const b = pos[p];
            if (!b) return <line key={c.sha + p} x1={cx(a.col)} y1={cy(a.row)} x2={cx(a.col)} y2={cy(a.row) + ROW / 2} stroke={a.color} strokeWidth={2} />;
            const x1 = cx(a.col), y1 = cy(a.row), x2 = cx(b.col), y2 = cy(b.row);
            const col = b.col === a.col ? a.color : pos[p].color;
            return <path key={c.sha + p} d={`M${x1},${y1} C${x1},${y1 + ROW / 2} ${x2},${y2 - ROW / 2} ${x2},${y2}`} stroke={col} strokeWidth={2} fill="none" />;
          });
        })}
        {commits.map((c) => {
          const a = pos[c.sha];
          const merge = c.parents.length > 1;
          return <circle key={c.sha} cx={cx(a.col)} cy={cy(a.row)} r={merge ? R + 1 : R}
            fill={merge ? "var(--bg)" : a.color} stroke={a.color} strokeWidth={2} />;
        })}
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {commits.map((c) => (
          <div key={c.sha} style={{ height: ROW, display: "flex", alignItems: "center", gap: 8, fontSize: 13, overflow: "hidden" }}>
            {c.branch && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, border: "1px solid var(--border)", color: "var(--muted)", flexShrink: 0 }}>{c.branch}</span>}
            {c.url
              ? <a href={c.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontFamily: "monospace", flexShrink: 0 }}>{c.sha.slice(0, 7)}</a>
              : <code style={{ color: "var(--muted)", flexShrink: 0 }}>{c.sha.slice(0, 7)}</code>}
            <span style={{ color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.message}</span>
            {c.author && <span title={c.author} style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--muted)", flexShrink: 0 }}>
              <img src={avatar(c.author)} width={18} height={18} style={{ borderRadius: "50%", background: "var(--panel)" }} alt="" /> {c.author}
            </span>}
          </div>
        ))}
      </div>
    </div>
   </div>
  );
}
