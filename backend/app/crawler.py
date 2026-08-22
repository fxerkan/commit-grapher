"""Deep crawl: account -> repos -> branches / PRs / commits, cached into SQLite.

# ponytail: sequential crawl, commits from the default branch only. Add concurrency
# (thread pool) and per-branch commit crawl only when a real account proves too slow
# or the graph needs non-default-branch commits.
"""
from __future__ import annotations

from datetime import datetime, timezone

from . import db
from .adapter import get_adapter


# ponytail: cap secondary branches per repo so a 1000-branch repo doesn't melt the API.
# Feature branches diverge by few commits, so a shallow pull per branch is enough for the DAG.
MAX_BRANCHES = 40


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def sync_account(account_id: int, adapter=None) -> dict:
    conn = db.connect()
    acc = conn.execute("SELECT * FROM accounts WHERE id=?", (account_id,)).fetchone()
    if acc is None:
        conn.close()
        raise ValueError(f"account {account_id} not found")
    adapter = adapter or get_adapter(acc["provider"])

    from .config import get_token

    token = get_token(acc["token_ref"])
    if not token:
        conn.close()
        raise ValueError("no token stored for account")

    counts = {"repos": 0, "branches": 0, "pull_requests": 0, "commits": 0, "tags": 0,
              "work_items": 0, "errors": []}
    projects_seen: set[str] = set()  # project prefixes of crawled repos → scope work-item fetch
    for norm_repo, repo_handle in adapter.list_repos(acc["owner_url"], token, username=acc["username"]):
        projects_seen.add(norm_repo.full_name.split("/", 1)[0])
        conn.execute(
            """INSERT INTO repos(account_id, provider, full_name, url, default_branch, last_synced_at,
                    stars, forks, watchers, open_issues, language)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(account_id, full_name) DO UPDATE SET
                   url=excluded.url, default_branch=excluded.default_branch,
                   last_synced_at=excluded.last_synced_at, stars=excluded.stars,
                   forks=excluded.forks, watchers=excluded.watchers,
                   open_issues=excluded.open_issues, language=excluded.language""",
            (account_id, acc["provider"], norm_repo.full_name, norm_repo.url,
             norm_repo.default_branch, datetime.now(timezone.utc).isoformat(),
             norm_repo.stars, norm_repo.forks, norm_repo.watchers,
             norm_repo.open_issues, norm_repo.language),
        )
        repo_id = conn.execute(
            "SELECT id FROM repos WHERE account_id=? AND full_name=?",
            (account_id, norm_repo.full_name),
        ).fetchone()["id"]
        counts["repos"] += 1

        # Per-repo deep calls are isolated: an empty/archived/no-access repo (e.g. GitHub
        # returns 409 on commits for an empty repo) is skipped, not fatal to the whole sync.
        def safe(fn, default=None):
            try:
                return fn()
            except Exception as e:  # noqa: BLE001
                counts["errors"].append(f"{norm_repo.full_name}: {type(e).__name__}")
                return [] if default is None else default

        # Summary stats (releases/downloads/contributors/builds/tags + docker/npm). Best-effort.
        ex = safe(lambda: adapter.extras(repo_handle), default={}) or {}
        if ex:
            conn.execute(
                """UPDATE repos SET releases=?, downloads=?, contributors=?, builds=?,
                        docker_pulls=?, npm_downloads=? WHERE id=?""",
                (ex.get("releases"), ex.get("downloads"), ex.get("contributors"), ex.get("builds"),
                 ex.get("docker_pulls"), ex.get("npm_downloads"), repo_id))
            for t in ex.get("tags", []):
                if conn.execute("INSERT OR IGNORE INTO tags(repo_id, name) VALUES(?,?)", (repo_id, t)).rowcount:
                    counts["tags"] += 1

        branch_names: list[str] = []
        for br in safe(lambda: adapter.branches(repo_handle)):
            conn.execute(
                "INSERT OR IGNORE INTO branches(repo_id, name) VALUES(?,?)",
                (repo_id, br.name),
            )
            branch_names.append(br.name)
            counts["branches"] += 1

        for pr in safe(lambda: adapter.pull_requests(repo_handle)):
            conn.execute(
                """INSERT INTO pull_requests(repo_id, number, title, state, author,
                        source_branch, target_branch, created_at, merged_at)
                   VALUES(?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(repo_id, number) DO UPDATE SET
                        title=excluded.title, state=excluded.state, merged_at=excluded.merged_at""",
                (repo_id, pr.number, pr.title, pr.state, pr.author,
                 pr.source_branch, pr.target_branch, _iso(pr.created_at), _iso(pr.merged_at)),
            )
            counts["pull_requests"] += 1

        def store_commits(branch, max_pages=None):
            fn = (lambda: adapter.commits(repo_handle, branch=branch, max_pages=max_pages)) if max_pages \
                else (lambda: adapter.commits(repo_handle, branch=branch))
            for c in safe(fn):
                conn.execute(
                    """INSERT INTO commits(sha, repo_id, branch_ref, author,
                            author_email, message, committed_at, url, parents)
                       VALUES(?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(repo_id, sha) DO UPDATE SET
                            url=excluded.url, parents=excluded.parents""",
                    (c.sha, repo_id, branch, c.author,
                     c.author_email, c.message, _iso(c.committed_at), c.url, c.parents),
                )
                counts["commits"] += 1

        # Default branch in full; then a capped set of other branches (shallow) so the
        # git-graph shows real feature-branch/merge structure without an unbounded crawl.
        default = norm_repo.default_branch
        store_commits(default)
        others = [b for b in branch_names if b != default][:MAX_BRANCHES]
        for b in others:
            store_commits(b, max_pages=1)

        conn.commit()

    # Work items / issues (Azure Boards now; Jira later). Per-account, related to repos by
    # project. Adapter-optional: providers without a work_items() method just skip this.
    if hasattr(adapter, "work_items"):
        try:
            for wi in adapter.work_items(acc["owner_url"], token, projects=projects_seen,
                                         username=acc["username"]):
                conn.execute(
                    """INSERT INTO work_items(account_id, provider, external_id, project,
                            wtype, title, state, labels, assignee, url)
                       VALUES(?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(account_id, external_id) DO UPDATE SET
                            title=excluded.title, state=excluded.state, labels=excluded.labels,
                            assignee=excluded.assignee, wtype=excluded.wtype""",
                    (account_id, acc["provider"], wi.external_id, wi.project, wi.wtype,
                     wi.title, wi.state, wi.labels, wi.assignee, wi.url),
                )
                counts["work_items"] += 1
            conn.commit()
        except Exception as e:  # noqa: BLE001 — boards may be disabled / no access; non-fatal.
            counts["errors"].append(f"work_items: {type(e).__name__}")

    conn.execute(
        "UPDATE accounts SET last_synced_at=? WHERE id=?",
        (datetime.now(timezone.utc).isoformat(), account_id),
    )
    conn.commit()
    conn.close()

    # Recompute Jira-issue <-> git links now that this account's data changed (cross-account,
    # so it must run over the whole DB, not just this account). Cheap + idempotent.
    from . import match
    counts["links"] = match.rebuild_links()
    return counts
