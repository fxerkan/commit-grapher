"""Aggregations for the contribution heatmap and other charts.

Daily buckets are computed from commit timestamps in the commit's own timezone
(what GitHub-style graphs show), so a commit at 23:30+02:00 counts on that local day.
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime

from . import db


def bucket_by_day(timestamps: list[str]) -> dict[str, int]:
    """ISO-8601 strings -> {"YYYY-MM-DD": count}. Timezone-aware: uses the local date
    carried by each timestamp's offset, not UTC. None/blank/unparseable are ignored."""
    counts: Counter[str] = Counter()
    for ts in timestamps:
        if not ts:
            continue
        try:
            day = datetime.fromisoformat(ts).date().isoformat()
        except ValueError:
            continue
        counts[day] += 1
    return dict(counts)


def heatmap(provider: str | None = None, repo_id: int | None = None,
            author: str | None = None) -> dict[str, int]:
    conn = db.connect()
    where, args = ["1=1"], []
    if provider:
        where.append("r.provider=?"); args.append(provider)
    if repo_id:
        where.append("r.id=?"); args.append(repo_id)
    if author:
        where.append("c.author=?"); args.append(author)
    rows = conn.execute(
        f"SELECT c.committed_at FROM commits c JOIN repos r ON c.repo_id=r.id WHERE {' AND '.join(where)}",
        args).fetchall()
    conn.close()
    return bucket_by_day([r["committed_at"] for r in rows])


def gitgraph(repo_id: int, limit: int = 200) -> list[dict]:
    """Commits of a repo (newest first) with parents — for git-graph DAG rendering."""
    conn = db.connect()
    rows = conn.execute(
        "SELECT sha, parents, message, author, url, committed_at, branch_ref "
        "FROM commits WHERE repo_id=? ORDER BY committed_at DESC LIMIT ?", (repo_id, limit)).fetchall()
    conn.close()
    return [{"sha": r["sha"], "parents": [p for p in (r["parents"] or "").split(",") if p],
             "message": (r["message"] or "").split("\n")[0], "author": r["author"],
             "url": r["url"], "committed_at": r["committed_at"], "branch": r["branch_ref"]} for r in rows]


def commits_query(date: str | None = None, provider: str | None = None,
                  repo_id: int | None = None, author: str | None = None, limit: int = 500) -> list[dict]:
    """Filterable commit list — powers heatmap day drill-down and cross-filtering.
    date = 'YYYY-MM-DD' matches the commit's local day (committed_at starts with it)."""
    conn = db.connect()
    sql = ["SELECT c.sha, c.author, c.author_email, c.message, c.committed_at, c.branch_ref, c.url, c.parents,",
           "r.full_name AS repo, r.provider FROM commits c JOIN repos r ON c.repo_id=r.id WHERE 1=1"]
    args: list = []
    if date:
        sql.append("AND substr(c.committed_at,1,10)=?"); args.append(date)
    if provider:
        sql.append("AND r.provider=?"); args.append(provider)
    if repo_id:
        sql.append("AND r.id=?"); args.append(repo_id)
    if author:
        sql.append("AND c.author=?"); args.append(author)
    sql.append("ORDER BY c.committed_at DESC LIMIT ?"); args.append(limit)
    rows = conn.execute(" ".join(sql), args).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def stats(provider: str | None = None, repo_id: int | None = None, author: str | None = None) -> dict:
    """Aggregations for the ECharts gallery, filterable for cross-filtering.
    With repo_id/author set, every chart (incl. the authors wordcloud) narrows accordingly."""
    conn = db.connect()

    # Shared commit-side filter used by monthly / top_repos / authors.
    where, args = ["c.committed_at IS NOT NULL"], []
    if provider:
        where.append("r.provider=?"); args.append(provider)
    if repo_id:
        where.append("r.id=?"); args.append(repo_id)
    if author:
        where.append("c.author=?"); args.append(author)
    cw = " AND ".join(where)
    j = "FROM commits c JOIN repos r ON c.repo_id=r.id WHERE " + cw

    monthly = {r["m"]: r["n"] for r in conn.execute(
        f"SELECT substr(c.committed_at,1,7) m, COUNT(*) n {j} GROUP BY m ORDER BY m", args).fetchall()}
    top_repos = [{"name": r["full_name"], "value": r["n"], "id": r["id"]} for r in conn.execute(
        f"SELECT r.full_name, r.id, COUNT(*) n {j} GROUP BY r.id ORDER BY n DESC LIMIT 12", args).fetchall()]
    authors = [{"name": r["author"], "value": r["n"]} for r in conn.execute(
        f"SELECT c.author, COUNT(*) n {j} AND c.author IS NOT NULL GROUP BY c.author ORDER BY n DESC LIMIT 60",
        args).fetchall()]

    # PR states use their own (repo/provider) filter — no author dimension on PRs.
    pw, pa = ["1=1"], []
    if provider:
        pw.append("r.provider=?"); pa.append(provider)
    if repo_id:
        pw.append("r.id=?"); pa.append(repo_id)
    pr_states = [{"name": r["state"] or "unknown", "value": r["n"]} for r in conn.execute(
        "SELECT p.state, COUNT(*) n FROM pull_requests p JOIN repos r ON p.repo_id=r.id "
        f"WHERE {' AND '.join(pw)} GROUP BY p.state", pa).fetchall()]

    conn.close()
    return {"monthly": monthly, "top_repos": top_repos, "pr_states": pr_states, "authors": authors}


def import_all(payload: dict) -> dict:
    """Merge an exported dump (or hand-built file) into the cache. Remaps IDs so imported
    data never collides with existing rows. Imported accounts have no token (view-only) —
    lets you bring in commits/PRs from providers you can't reach via API."""
    from datetime import datetime, timezone

    conn = db.connect()
    acc_map: dict[int, int] = {}
    repo_map: dict[int, int] = {}
    counts = {"accounts": 0, "repos": 0, "branches": 0, "pull_requests": 0, "commits": 0}

    for a in payload.get("accounts", []):
        ref = f"imported:{a['provider']}:{a['username']}"
        row = conn.execute("SELECT id FROM accounts WHERE provider=? AND username=?",
                           (a["provider"], a["username"])).fetchone()
        if row:
            new_id = row["id"]
        else:
            new_id = conn.execute(
                "INSERT INTO accounts(provider,username,owner_url,token_ref,created_at) VALUES(?,?,?,?,?)",
                (a["provider"], a["username"], a.get("owner_url", ""), ref,
                 datetime.now(timezone.utc).isoformat())).lastrowid
            counts["accounts"] += 1
        acc_map[a["id"]] = new_id

    for r in payload.get("repos", []):
        new_acc = acc_map.get(r["account_id"])
        if new_acc is None:
            continue
        conn.execute(
            "INSERT OR IGNORE INTO repos(account_id,provider,full_name,url,default_branch) VALUES(?,?,?,?,?)",
            (new_acc, r["provider"], r["full_name"], r.get("url", ""), r.get("default_branch")))
        new_repo = conn.execute("SELECT id FROM repos WHERE account_id=? AND full_name=?",
                                (new_acc, r["full_name"])).fetchone()["id"]
        repo_map[r["id"]] = new_repo
        counts["repos"] += 1

    for b in payload.get("branches", []):
        rid = repo_map.get(b["repo_id"])
        if rid and conn.execute("INSERT OR IGNORE INTO branches(repo_id,name) VALUES(?,?)", (rid, b["name"])).rowcount:
            counts["branches"] += 1
    for p in payload.get("pull_requests", []):
        rid = repo_map.get(p["repo_id"])
        if rid and conn.execute(
            "INSERT OR IGNORE INTO pull_requests(repo_id,number,title,state,author,source_branch,target_branch,created_at,merged_at)"
            " VALUES(?,?,?,?,?,?,?,?,?)",
            (rid, p["number"], p.get("title"), p.get("state"), p.get("author"), p.get("source_branch"),
             p.get("target_branch"), p.get("created_at"), p.get("merged_at"))).rowcount:
            counts["pull_requests"] += 1
    for c in payload.get("commits", []):
        rid = repo_map.get(c["repo_id"])
        if rid and conn.execute(
            "INSERT OR IGNORE INTO commits(sha,repo_id,branch_ref,author,author_email,message,committed_at)"
            " VALUES(?,?,?,?,?,?,?)",
            (c["sha"], rid, c.get("branch_ref"), c.get("author"), c.get("author_email"),
             c.get("message"), c.get("committed_at"))).rowcount:
            counts["commits"] += 1

    conn.commit()
    conn.close()
    return counts


def export_all() -> dict:
    """Full data dump (no tokens) for JSON export."""
    conn = db.connect()
    tables = ["accounts", "repos", "branches", "pull_requests", "commits"]
    out: dict = {}
    for t in tables:
        cols = "id, provider, username, owner_url, last_synced_at" if t == "accounts" else "*"
        out[t] = [dict(r) for r in conn.execute(f"SELECT {cols} FROM {t}").fetchall()]
    conn.close()
    return out


def summary() -> dict:
    conn = db.connect()
    row = conn.execute(
        """SELECT
             (SELECT COUNT(*) FROM accounts)      AS accounts,
             (SELECT COUNT(*) FROM repos)         AS repos,
             (SELECT COUNT(*) FROM branches)      AS branches,
             (SELECT COUNT(*) FROM pull_requests) AS pull_requests,
             (SELECT COUNT(*) FROM commits)       AS commits"""
    ).fetchone()
    conn.close()
    return dict(row)
