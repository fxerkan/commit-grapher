# Connecting Jira

Jira is a **separate platform** from your version control — it holds issues/tasks, not code.
commit-grapher reads Jira **issue metadata only** (key, summary, type, status, labels, assignee)
and then **relates each issue to your commits, PRs and branches** so they connect in the graph.

## Create an API token

1. Go to **[id.atlassian.com → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)**.
2. **Create API token**, give it a label, copy the value.
3. In commit-grapher → provider **Jira**:
   - **username = your Atlassian account email** (the login email).
   - **owner_url = your site**, e.g. `https://your-site.atlassian.net` (**required** — there is no default).
   - Paste the API token.

Auth is HTTP Basic (email + token). The token is stored in your OS keychain, never on disk.

## How issues are matched to git

Two signals, best first:

1. **Issue key (exact).** A key like `ABC-123` appearing in a **commit message**, **PR title**, or
   **branch name** links that issue to the artifact — the same convention as Jira Smart Commits.
   Only keys whose prefix is a real Jira project *and* whose full key is a known issue count, so
   `UTF-8` / `COVID-19` never false-match.
2. **Title (fuzzy).** When no key is present, the issue summary is compared to PR titles and branch
   names by normalized word overlap (Jaccard ≥ 0.6, stopwords stripped) — catching links a human
   made without ever typing the key.

Links rebuild automatically after every sync; you can also trigger `POST /api/match` manually.
In the graph, selecting the **Jira account** reveals each matched issue with the PR / branch / repo
it connects to.

## What is synced

- Issues updated in the **last 365 days** (the enhanced Jira search requires a bounded query),
  newest first, capped at ~2000. Widen the window in `adapter.py` (`JIRA_JQL`) if you need older issues.
- No comments, descriptions, attachments, or worklogs — titles and labels only.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Site temporarily unavailable` (404) | The `owner_url` site name is wrong | Use your exact site, e.g. `https://acme.atlassian.net` — check the URL you log in at |
| `401 Unauthorized` | Wrong email, or a revoked/expired token | username must be the **Atlassian email**; recreate the API token |
| `410 Gone` on `/search` | Old Jira search API retired by Atlassian | Already handled — commit-grapher uses the enhanced `/search/jql` endpoint |
| `Unbounded JQL not allowed` (400) | Enhanced search rejects open-ended queries | Already handled — the query is bounded to a recent window |
| Issues sync but nothing links | Your commits/PRs don't reference the issue keys | Put `ABC-123` in commit messages / branch names, or rely on the fuzzy title match |

## Finding your site URL

It's the host you sign in at: **`https://<site>.atlassian.net`**. Org admins can confirm it under
**admin.atlassian.com → your organization → Products**.
