import { langColor } from "../langColors";

// GitHub-style stacked % language bar with legend.
export default function LanguagesBar({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", gap: 2, background: "var(--border)" }}>
        {data.map((d) => (
          <div key={d.name} title={`${d.name} ${((d.value / total) * 100).toFixed(1)}%`}
            style={{ width: `${(d.value / total) * 100}%`, background: langColor(d.name) }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 12 }}>
        {data.map((d) => (
          <span key={d.name} style={{ fontSize: 13, display: "inline-flex", alignItems: "center" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: langColor(d.name), marginRight: 6 }} />
            <b>{d.name}</b>&nbsp;<span style={{ color: "var(--muted)" }}>{((d.value / total) * 100).toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
