// App identity for the UI (filter-panel footer). The version is injected at build time
// from package.json (see vite.config.ts `define`), so it's never hardcoded in app code —
// bump it in ONE place: frontend/package.json (and add a CHANGELOG.md entry).
declare const __APP_VERSION__: string;

export const APP_NAME = "commit-grapher";
export const APP_VERSION = __APP_VERSION__;
export const REPO_URL = "https://github.com/fxerkan/commit-grapher";
export const AUTHOR_URL = "https://github.com/FXerkan";
