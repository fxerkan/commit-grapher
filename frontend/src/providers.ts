// Provider metadata for the onboarding wizard + Accounts. Logos come from the
// simple-icons CDN (no local assets); cards degrade to a colored badge if offline.
export interface ProviderMeta {
  id: string;
  name: string;
  slug: string;        // simple-icons slug -> https://cdn.simpleicons.org/<slug>
  color: string;       // brand color
  supported: boolean;  // has a backend adapter (github/azure); others are preview
  usernameLabel: string;
  ownerHint: string;
  tokenUrl: string;
  scopes: string;
  steps: string[];
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "github", name: "GitHub", slug: "github", color: "#8b949e", supported: true,
    usernameLabel: "username", ownerHint: "https://github.com/<username>",
    tokenUrl: "https://github.com/settings/tokens/new?scopes=repo,read:user&description=commit-grapher",
    scopes: "repo, read:user",
    steps: [
      "Open GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic).",
      "Generate a new token with the repo and read:user scopes.",
      "Copy the token (starts with ghp_) and paste it below.",
      "Or use ‘Login with GitHub’ (OAuth) to skip the token entirely.",
    ],
  },
  {
    id: "azure", name: "Azure DevOps", slug: "azuredevops", color: "#0078d7", supported: true,
    usernameLabel: "organization", ownerHint: "https://dev.azure.com/<org>",
    tokenUrl: "https://dev.azure.com",
    scopes: "Code (Read)",
    steps: [
      "In Azure DevOps → User settings → Personal access tokens → New Token.",
      "Scope: Code → Read. Pick the right organization.",
      "Your ‘username’ here is the organization name (dev.azure.com/<org>).",
      "Note: a Stakeholder license cannot read repos — you need Basic access.",
    ],
  },
  {
    id: "jira", name: "Jira", slug: "jira", color: "#2684ff", supported: true,
    usernameLabel: "Atlassian email", ownerHint: "https://<your-site>.atlassian.net",
    tokenUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
    scopes: "read (Jira issues)",
    steps: [
      "A separate platform from your VCS — its issues/tasks are matched to your commits & PRs.",
      "Create an API token at id.atlassian.com → Security → API tokens → Create.",
      "‘username’ here is your Atlassian account email; paste the API token below.",
      "owner_url is required: your site, e.g. https://acme.atlassian.net.",
    ],
  },
  {
    id: "gitlab", name: "GitLab", slug: "gitlab", color: "#fc6d26", supported: false,
    usernameLabel: "username", ownerHint: "https://gitlab.com/<username>",
    tokenUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
    scopes: "read_api",
    steps: ["Preview: adapter coming soon.", "GitLab → Settings → Access tokens → scope read_api."],
  },
  {
    id: "bitbucket", name: "Bitbucket", slug: "bitbucket", color: "#0052cc", supported: false,
    usernameLabel: "workspace", ownerHint: "https://bitbucket.org/<workspace>",
    tokenUrl: "https://bitbucket.org/account/settings/app-passwords/",
    scopes: "Repositories: Read",
    steps: ["Preview: adapter coming soon.", "Create an App password with Repositories: Read."],
  },
  {
    id: "gitea", name: "Gitea", slug: "gitea", color: "#609926", supported: false,
    usernameLabel: "username", ownerHint: "https://your-gitea/<username>",
    tokenUrl: "#", scopes: "repo",
    steps: ["Preview: adapter coming soon.", "Settings → Applications → Generate token.", "Provide the full owner_url for self-hosted instances."],
  },
  {
    id: "codeberg", name: "Codeberg", slug: "codeberg", color: "#2185d0", supported: false,
    usernameLabel: "username", ownerHint: "https://codeberg.org/<username>",
    tokenUrl: "https://codeberg.org/user/settings/applications",
    scopes: "read:repository",
    steps: ["Preview: adapter coming soon.", "Codeberg is a Gitea instance — same token flow."],
  },
];

// GitHub's brand ink is near-black (invisible on dark); force a theme-contrast color.
// Others keep their brand color.
export const logoUrl = (slug: string, theme = "dark") =>
  slug === "github"
    ? `https://cdn.simpleicons.org/github/${theme === "light" ? "181717" : "ffffff"}`
    : `https://cdn.simpleicons.org/${slug}`;
