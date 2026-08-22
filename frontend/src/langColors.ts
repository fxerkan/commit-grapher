// GitHub Linguist colors for the common languages; anything else gets a stable hashed hue.
export const LANG_COLOR: Record<string, string> = {
  Python: "#3572A5", JavaScript: "#f1e05a", TypeScript: "#3178c6", "C#": "#178600",
  HTML: "#e34c26", CSS: "#563d7c", Java: "#b07219", Go: "#00ADD8", Rust: "#dea584",
  Ruby: "#701516", Shell: "#89e051", "C++": "#f34b7d", C: "#555555", PHP: "#4F5D95",
  Kotlin: "#A97BFF", Swift: "#F05138", Dart: "#00B4AB", Vue: "#41b883", TSQL: "#e38c00",
  Makefile: "#427819", Dockerfile: "#384d54", "Jupyter Notebook": "#DA5B0B", Scala: "#c22d40",
  Elixir: "#6e4a7e", Lua: "#000080", "Objective-C": "#438eff", PowerShell: "#012456",
  R: "#198CE7", Perl: "#0298c3", Haskell: "#5e5086", Clojure: "#db5855", SCSS: "#c6538c",
};

export const langColor = (n: string): string =>
  LANG_COLOR[n] || `hsl(${([...n].reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360} 55% 55%)`;
