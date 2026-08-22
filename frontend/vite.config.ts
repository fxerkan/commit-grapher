import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Single source of truth for the version: package.json. Injected at build time as
// __APP_VERSION__ so nothing hardcodes the version in app code.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { proxy: { "/api": "http://localhost:8000" } },
});
