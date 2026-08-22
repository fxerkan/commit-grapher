"""Build a graphology/Sigma-shaped network graph from the SQLite cache.

Nodes: account -> repo -> branch / pull_request. Commits are AGGREGATED (repo node
size grows with its commit count) rather than one node per commit, except when a repo
is focused — then its commits are expanded.

# ponytail: commits aggregated into repo size. One-node-per-commit would blow up a
# large account; focus-a-repo expands its commits on demand.
"""
from __future__ import annotations

import math

from . import db

COLORS = {
    "account": "#f78166",
    "repo": "#58a6ff",
    "branch": "#3fb950",
    "pr": "#bc8cff",
    "commit": "#d29922",
}
EXPAND_COMMIT_CAP = 300  # ponytail: cap expanded commit nodes per repo; drill deeper later if needed.


def _scatter(i: int) -> tuple[float, float]:
    # Deterministic sunflower spread so Sigma has initial coords before ForceAtlas2 runs.
    angle = i * 2.399963  # golden angle (radians)
    r = math.sqrt(i + 1)
    return r * math.cos(angle), r * math.sin(angle)


def _project_of(full_name: str) -> str:
    return full_name.split("/", 1)[0] if "/" in full_name else full_name


def build(provider: str | None = None, focus_repo: int | None = None,
          authors: list[str] | None = None, repo_ids: list[int] | None = None,
          projects: list[str] | None = None) -> dict:
    """provider filters accounts; focus_repo shows ONLY that repo's subgraph (commits expanded);
    authors restricts to repos where those authors committed (and, when focused, to their commits).
    Nodes carry repoId/project (+ author for commits) so the client can filter live."""
    conn = db.connect()
    nodes: list[dict] = []
    edges: list[dict] = []
    i = 0
    authors = [a for a in (authors or []) if a]

    # Repos where at least one of the selected authors has committed.
    author_repo_ids: set[int] | None = None
    if authors:
        ph = ",".join("?" * len(authors))
        author_repo_ids = {r["repo_id"] for r in conn.execute(
            f"SELECT DISTINCT repo_id FROM commits WHERE author IN ({ph})", authors).fetchall()}

    def add_node(key, label, node_type, size, repo_id=None, author=None, project=None):
        nonlocal i
        x, y = _scatter(i)
        i += 1
        attrs = {"label": label, "nodeType": node_type, "size": size,
                 "color": COLORS[node_type], "x": x, "y": y}
        if repo_id is not None:
            attrs["repoId"] = repo_id
        if author is not None:
            attrs["author"] = author
        if project is not None:
            attrs["project"] = project
        nodes.append({"key": key, "attributes": attrs})

    if provider:
        accounts = conn.execute("SELECT * FROM accounts WHERE provider=?", (provider,)).fetchall()
    else:
        accounts = conn.execute("SELECT * FROM accounts").fetchall()

    for acc in accounts:
        if focus_repo is not None:
            repos = conn.execute("SELECT * FROM repos WHERE account_id=? AND id=?",
                                 (acc["id"], focus_repo)).fetchall()
            if not repos:
                continue
        else:
            repos = conn.execute("SELECT * FROM repos WHERE account_id=?", (acc["id"],)).fetchall()
        if author_repo_ids is not None:
            repos = [r for r in repos if r["id"] in author_repo_ids]
        if repo_ids:
            repos = [r for r in repos if r["id"] in set(repo_ids)]
        if projects:
            pset = set(projects)
            repos = [r for r in repos if _project_of(r["full_name"]) in pset]
        if not repos:
            continue

        akey = f"account:{acc['id']}"
        add_node(akey, f"{acc['username']} ({acc['provider']})", "account", 14)

        for repo in repos:
            _proj = _project_of(repo["full_name"])
            rid = repo["id"]
            rkey = f"repo:{rid}"
            ncommits = conn.execute("SELECT COUNT(*) n FROM commits WHERE repo_id=?", (rid,)).fetchone()["n"]
            add_node(rkey, repo["full_name"], "repo", 6 + math.log1p(ncommits) * 3, repo_id=rid, project=_proj)
            edges.append({"key": f"{akey}->{rkey}", "source": akey, "target": rkey})

            branch_keys: dict[str, str] = {}
            for br in conn.execute("SELECT * FROM branches WHERE repo_id=?", (rid,)).fetchall():
                bkey = f"branch:{br['id']}"
                branch_keys[br["name"]] = bkey
                add_node(bkey, br["name"], "branch", 3, repo_id=rid, project=_proj)
                edges.append({"key": f"{rkey}->{bkey}", "source": rkey, "target": bkey})

            for pr in conn.execute("SELECT * FROM pull_requests WHERE repo_id=?", (rid,)).fetchall():
                pkey = f"pr:{pr['id']}"
                add_node(pkey, f"#{pr['number']} {pr['title'] or ''}".strip(), "pr", 4, repo_id=rid, project=_proj)
                edges.append({"key": f"{rkey}->{pkey}", "source": rkey, "target": pkey})
                tgt = branch_keys.get(pr["target_branch"])
                if tgt:
                    edges.append({"key": f"{pkey}->{tgt}", "source": pkey, "target": tgt})

            # Focused repo -> expand its commits as individual nodes (author-scoped if set).
            if focus_repo == rid:
                if authors:
                    ph = ",".join("?" * len(authors))
                    rows = conn.execute(
                        f"SELECT sha, message, author FROM commits WHERE repo_id=? AND author IN ({ph}) "
                        "ORDER BY committed_at DESC LIMIT ?", (rid, *authors, EXPAND_COMMIT_CAP)).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT sha, message, author FROM commits WHERE repo_id=? ORDER BY committed_at DESC LIMIT ?",
                        (rid, EXPAND_COMMIT_CAP)).fetchall()
                for cm in rows:
                    ckey = f"commit:{rid}:{cm['sha']}"
                    label = (cm["message"] or cm["sha"]).splitlines()[0][:48]
                    add_node(ckey, label, "commit", 2, repo_id=rid, author=cm["author"], project=_proj)
                    edges.append({"key": f"{rkey}->{ckey}", "source": rkey, "target": ckey})

    conn.close()
    return {"nodes": nodes, "edges": edges}
