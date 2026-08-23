// Render the current network graph headlessly (an off-screen Sigma instance) and download it
// as a PNG. Reuses the same layout as the live GraphView so the image matches what you see.
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { api, GraphData } from "./api";
import { getSettings } from "./settings";

export async function exportGraphPNG(): Promise<{ nodes: number; edges: number }> {
  const data: GraphData = await api.graph();
  const graph = new Graph();
  data.nodes.forEach((n) => graph.addNode(n.key, { ...n.attributes }));
  data.edges.forEach((e) => {
    if (graph.hasNode(e.source) && graph.hasNode(e.target) && !graph.hasEdge(e.source, e.target))
      graph.addEdgeWithKey(e.key, e.source, e.target, {});
  });
  if (graph.order > 1)
    forceAtlas2.assign(graph, { iterations: graph.order > 2000 ? 60 : 250, settings: { gravity: 1, scalingRatio: 25 } });

  const st = getSettings();
  const light = st.theme === "light";
  const bg = light ? "#ffffff" : "#0d1117";
  const W = 2000, H = 1250;

  // Off-screen container (kept in the DOM with real dimensions so Sigma can render into it).
  const box = document.createElement("div");
  box.style.cssText = `position:fixed;top:0;left:-99999px;width:${W}px;height:${H}px;`;
  document.body.appendChild(box);

  const renderer = new Sigma(graph, box, {
    labelColor: { color: light ? "#1f2328" : "#e6edf3" },
    labelRenderedSizeThreshold: st.labelDensity,
    labelWeight: "600",
  });
  renderer.refresh();
  // Let the WebGL/canvas layers paint before we read them back.
  await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));

  try {
    const layers = renderer.getCanvases();
    const ref = Object.values(layers)[0] as HTMLCanvasElement | undefined;
    const out = document.createElement("canvas");
    out.width = ref?.width || W;
    out.height = ref?.height || H;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, out.width, out.height);
    // Composite Sigma's layers (edges under nodes under labels) onto one opaque canvas.
    for (const id of ["edges", "edgeLabels", "nodes", "labels"]) {
      const c = layers[id];
      if (c) ctx.drawImage(c, 0, 0, out.width, out.height);
    }
    const url = out.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "commit-graph.png";
    a.click();
    return { nodes: data.nodes.length, edges: data.edges.length };
  } finally {
    renderer.kill();
    box.remove();
  }
}
