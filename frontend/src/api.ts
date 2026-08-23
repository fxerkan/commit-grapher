export interface Account {
  id: number;
  provider: string;
  username: string;
  display_name?: string | null;
  owner_url: string;
  last_synced_at: string | null;
}
export interface GraphData {
  nodes: { key: string; attributes: Record<string, any> }[];
  edges: { key: string; source: string; target: string }[];
}

const j = (r: Response) => {
  if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e.detail || r.statusText)));
  return r.json();
};

// Shared filter shape across graph/heatmap/charts/commits/facets/contributors.
export interface Filters {
  provider?: string; providers?: string[]; authors?: string[]; repo_ids?: number[];
  projects?: string[]; organizations?: string[]; account_ids?: number[];
  start?: string; end?: string;
  languages?: string[]; libraries?: string[]; ai_agents?: string[];
}
const dimParams = (p: URLSearchParams, q?: Filters) => {
  if (q?.languages?.length) p.set("languages", q.languages.join("||"));
  if (q?.libraries?.length) p.set("libraries", q.libraries.join("||"));
  if (q?.ai_agents?.length) p.set("ai_agents", q.ai_agents.join("||"));
};

export const api = {
  accounts: (): Promise<Account[]> => fetch("/api/accounts").then(j),
  addAccount: (body: { provider: string; username: string; token: string; owner_url?: string }) =>
    fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(j),
  deleteAccount: (id: number) => fetch(`/api/accounts/${id}`, { method: "DELETE" }).then(j),
  sync: (id: number) => fetch(`/api/accounts/${id}/sync`, { method: "POST" }).then(j),
  graph: (opts?: Filters & { repo_id?: number }): Promise<GraphData> => {
    const p = new URLSearchParams();
    if (opts?.provider) p.set("provider", opts.provider);
    if (opts?.repo_id != null) p.set("repo_id", String(opts.repo_id));
    if (opts?.authors?.length) p.set("authors", opts.authors.join("||"));
    if (opts?.repo_ids?.length) p.set("repo_ids", opts.repo_ids.join(","));
    if (opts?.projects?.length) p.set("projects", opts.projects.join("||"));
    if (opts?.organizations?.length) p.set("organizations", opts.organizations.join("||"));
    if (opts?.account_ids?.length) p.set("account_ids", opts.account_ids.join(","));
    dimParams(p, opts);
    const qs = p.toString();
    return fetch("/api/graph" + (qs ? `?${qs}` : "")).then(j);
  },
  graphql: (query: string, provider?: string, repo_id?: number): Promise<{ data: any; errors?: { message: string }[] }> =>
    fetch("/api/graphql", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, provider, repo_id }),
    }).then(j),
  renameAccount: (id: number, display_name: string) =>
    fetch(`/api/accounts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_name }) }).then(j),
  oauthStart: (client_id: string) =>
    fetch("/api/oauth/github/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id }),
    }).then(j),
  oauthPoll: (client_id: string, device_code: string) =>
    fetch("/api/oauth/github/poll", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id, device_code }),
    }).then(j),
  heatmap: (q?: Filters): Promise<Record<string, number>> => {
    const p = new URLSearchParams();
    if (q?.providers?.length) p.set("providers", q.providers.join(","));
    if (q?.repo_ids?.length) p.set("repo_ids", q.repo_ids.join(","));
    if (q?.authors?.length) p.set("authors", q.authors.join("||"));
    if (q?.start) p.set("start", q.start);
    if (q?.end) p.set("end", q.end);
    dimParams(p, q);
    const qs = p.toString();
    return fetch("/api/heatmap" + (qs ? `?${qs}` : "")).then(j);
  },
  gitgraph: (repo_id: number, limit = 200): Promise<GitCommit[]> =>
    fetch(`/api/gitgraph?repo_id=${repo_id}&limit=${limit}`).then(j),
  charts: (q?: Filters): Promise<ChartStats> => {
    const p = new URLSearchParams();
    if (q?.providers?.length) p.set("providers", q.providers.join(","));
    if (q?.repo_ids?.length) p.set("repo_ids", q.repo_ids.join(","));
    if (q?.authors?.length) p.set("authors", q.authors.join("||"));
    if (q?.start) p.set("start", q.start);
    if (q?.end) p.set("end", q.end);
    dimParams(p, q);
    const qs = p.toString();
    return fetch("/api/charts" + (qs ? `?${qs}` : "")).then(j);
  },
  facets: (q?: Filters): Promise<Facets> => {
    const p = new URLSearchParams();
    if (q?.provider) p.set("provider", q.provider);
    if (q?.projects?.length) p.set("projects", q.projects.join("||"));
    if (q?.repo_ids?.length) p.set("repo_ids", q.repo_ids.join(","));
    if (q?.organizations?.length) p.set("organizations", q.organizations.join("||"));
    if (q?.account_ids?.length) p.set("account_ids", q.account_ids.join(","));
    const qs = p.toString();
    return fetch("/api/facets" + (qs ? `?${qs}` : "")).then(j);
  },
  commits: (q: Filters & { date?: string; limit?: number }): Promise<CommitRow[]> => {
    const p = new URLSearchParams();
    if (q.date) p.set("date", q.date);
    if (q.providers?.length) p.set("providers", q.providers.join(","));
    if (q.repo_ids?.length) p.set("repo_ids", q.repo_ids.join(","));
    if (q.authors?.length) p.set("authors", q.authors.join("||"));
    if (q.start) p.set("start", q.start);
    if (q.end) p.set("end", q.end);
    if (q.limit != null) p.set("limit", String(q.limit));
    dimParams(p, q);
    return fetch("/api/commits?" + p.toString()).then(j);
  },
  contributors: (q?: Filters): Promise<ContributorGraph> => {
    const p = new URLSearchParams();
    if (q?.providers?.length) p.set("providers", q.providers.join(","));
    if (q?.repo_ids?.length) p.set("repo_ids", q.repo_ids.join(","));
    if (q?.start) p.set("start", q.start);
    if (q?.end) p.set("end", q.end);
    dimParams(p, q);
    const qs = p.toString();
    return fetch("/api/contributors" + (qs ? `?${qs}` : "")).then(j);
  },
  contributorDetail: (q: Filters & { login?: string; repo_id?: number }): Promise<ContributorDetail> => {
    const p = new URLSearchParams();
    if (q.login) p.set("login", q.login);
    if (q.repo_id != null) p.set("repo_id", String(q.repo_id));
    if (q.providers?.length) p.set("providers", q.providers.join(","));
    if (q.repo_ids?.length) p.set("repo_ids", q.repo_ids.join(","));
    if (q.start) p.set("start", q.start);
    if (q.end) p.set("end", q.end);
    dimParams(p, q);
    return fetch("/api/contributors/detail?" + p.toString()).then(j);
  },
  achievements: (): Promise<AchievementRow[]> => fetch("/api/achievements").then(j),
  summary: () => fetch("/api/summary").then(j),
  importData: (payload: any) =>
    fetch("/api/import", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }).then(j),
};

export interface Facets {
  providers: string[];
  organizations: { name: string; provider: string }[];
  projects: { name: string; provider: string }[];
  repos: { id: number; full_name: string; provider: string; project: string; repo: string; organization: string; account_id: number; tags: string[]; languages: string[]; libraries: string[] }[];
  branches: { name: string; repo_id: number; count: number }[];
  prs: { id: number; number: number; title: string | null; repo_id: number }[];
  authors: { name: string; count: number; bot: boolean }[];
  tags: { name: string; count: number }[];
  languages: { name: string; count: number }[];
  libraries: { name: string; count: number }[];
  ai_agents: { name: string; count: number }[];
  accounts: { id: number; provider: string; username: string; display_name: string }[];
  account_names: string[];
}
export interface CommitRow {
  sha: string; author: string | null; author_email: string | null; message: string | null;
  committed_at: string | null; branch_ref: string | null; repo: string; provider: string;
  url: string | null; parents: string | null; ai_agent?: string | null; ai_role?: string | null;
}
export interface AchievementRow {
  account_id: number; username: string; slug: string; name: string; tier: number; image_url: string;
}
export interface ContributorNode {
  login: string; name: string | null; avatar: string | null;
  commits: number; additions: number; deletions: number; repos: number;
}
export interface ContributorGraph {
  nodes: { key: string; attributes: Record<string, any> }[];
  edges: { key: string; source: string; target: string }[];
  list: ContributorNode[];
}
export interface ContributorDetail {
  login: string; name: string | null; avatar: string | null; rank: number;
  commits: number; additions: number; deletions: number;
  weekly: { week: string; commits: number }[];
  top_repos: { name: string; value: number; id: number }[];
  languages: { name: string; value: number }[];
  pulse: { prs_merged: number; prs_open: number; prs_total: number; issues_open: number; issues_closed: number };
  contributors: ContributorNode[];
}
export interface GitCommit {
  sha: string; parents: string[]; message: string; author: string | null;
  url: string | null; committed_at: string | null; branch: string | null;
}

export interface ChartStats {
  totals: { commits: number; repos: number; authors: number; prs: number; active_days: number; streak: number };
  monthly: Record<string, number>;
  top_repos: { name: string; value: number; id: number }[];
  pr_states: { name: string; value: number }[];
  authors: { name: string; value: number }[];
  by_hour: number[];
  by_weekday: number[];
  night_owl_hour: number;
  busiest_day: { day: string; count: number } | null;
  repo_stats: { stars: number; forks: number; watchers: number; open_issues: number; releases: number; contributors: number; downloads: number; builds: number; docker_pulls: number; npm_downloads: number };
  top_starred: { name: string; value: number; id: number }[];
  tags: { name: string; value: number }[];
  languages: { name: string; value: number }[];
  ai: {
    by_agent: { name: string; value: number }[];
    by_role: { name: string; value: number }[];
    human_vs_ai: { name: string; value: number }[];
  };
  pulse: { prs_merged: number; prs_open: number; prs_total: number; issues_open: number; issues_closed: number };
  facts: {
    longest_commit: { message: string; author: string | null; sha: string; url: string | null; committed_at: string; repo: string; len: number } | null;
    far_away_commit: { message: string; author: string | null; sha: string; url: string | null; committed_at: string; repo: string } | null;
    far_away_pr: { number: number; title: string | null; state: string | null; author: string | null; created_at: string; repo: string } | null;
    graveyard: { repo: string; id: number; last: string; commits: number }[];
    besties: { a: string; b: string; shared: number }[];
  };
}
