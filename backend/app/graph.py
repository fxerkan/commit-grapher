"""Build a graphology/Sigma-shaped network graph from the SQLite cache.

Nodes: account -> repo -> branch / pull_request. Commits are AGGREGATED (repo node
size grows with its commit count) rather than one node per commit, except when a repo
is focused — then its commits are expanded.

# ponytail: commits aggregated into repo size. One-node-per-commit would blow up a
# large account; focus-a-repo expands its commits on demand.
"""
from __future__ import annotations

import json
import math

from . import db


def _repo_langs(row) -> set[str]:
    try:
        return set(json.loads(row["languages"] or "{}").keys())
    except (ValueError, TypeError):
        return set()


def _repo_topics(row) -> set[str]:
    return {t for t in (row["topics"] or "").split(",") if t}

COLORS = {
    "account": "#f78166",
    "repo": "#58a6ff",
    "branch": "#3fb950",
    "pr": "#bc8cff",
    "commit": "#d29922",
    "workitem": "#db61a2",
}
EXPAND_COMMIT_CAP = 300  # ponytail: cap expanded commit nodes per repo; drill deeper later if needed.


def _scatter(i: int) -> tuple[float, float]:
    # Deterministic sunflower spread so Sigma has initial coords before ForceAtlas2 runs.
    angle = i * 2.399963  # golden angle (radians)
    r = math.sqrt(i + 1)
    return r * math.cos(angle), r * math.sin(angle)


def _project_of(full_name: str) -> str:
    return full_name.split("/", 1)[0] if "/" in full_name else full_name


def _org_of(acc, full_name: str) -> str:
    # Azure: the DevOps org is the account; GitHub: the repo owner (org or user).
    return acc["username"] if acc["provider"] == "azure" else _project_of(full_name)


def build(provider: str | None = None, focus_repo: int | None = None,
          authors: list[str] | None = None, repo_ids: list[int] | None = None,
          projects: list[str] | None = None, organizations: list[str] | None = None,
          account_ids: list[int] | None = None, languages: list[str] | None = None,
          libraries: list[str] | None = None, ai_agents: list[str] | None = None) -> dict:
    """provider filters accounts; focus_repo shows ONLY that repo's subgraph (commits expanded);
    authors restricts to repos where those authors committed (and, when focused, to their commits).
    Nodes carry repoId/project (+ author for commits) so the client can filter live."""
    conn = db.connect()
    nodes: list[dict] = []
    edges: list[dict] = []
    added: set[str] = set()  # node keys already emitted (so cross-account Jira links only draw to real nodes)
    i = 0
    authors = [a for a in (authors or []) if a]

    # Repos where at least one of the selected authors has committed.
    author_repo_ids: set[int] | None = None
    if authors:
        ph = ",".join("?" * len(authors))
        author_repo_ids = {r["repo_id"] for r in conn.execute(
            f"SELECT DISTINCT repo_id FROM commits WHERE author IN ({ph})", authors).fetchall()}

    # Repos with at least one commit attributed to a selected AI agent.
    ai_agents = [a for a in (ai_agents or []) if a]
    ai_repo_ids: set[int] | None = None
    if ai_agents:
        ph = ",".join("?" * len(ai_agents))
        ai_repo_ids = {r["repo_id"] for r in conn.execute(
            f"SELECT DISTINCT repo_id FROM commits WHERE ai_agent IN ({ph})", ai_agents).fetchall()}

    lang_set = set(languages) if languages else None
    lib_set = set(libraries) if libraries else None

    def add_node(key, label, node_type, size, repo_id=None, author=None, project=None,
                 organization=None, ai_agent=None):
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
        if organization is not None:
            attrs["organization"] = organization
        if ai_agent is not None:
            attrs["aiAgent"] = ai_agent
        nodes.append({"key": key, "attributes": attrs})
        added.add(key)

    if provider:
        accounts = conn.execute("SELECT * FROM accounts WHERE provider=?", (provider,)).fetchall()
    else:
        accounts = conn.execute("SELECT * FROM accounts").fetchall()
    if account_ids:
        accounts = [a for a in accounts if a["id"] in set(account_ids)]
    org_set = set(organizations) if organizations else None

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
        if ai_repo_ids is not None:
            repos = [r for r in repos if r["id"] in ai_repo_ids]
        if lang_set is not None:
            repos = [r for r in repos if _repo_langs(r) & lang_set]
        if lib_set is not None:
            repos = [r for r in repos if _repo_topics(r) & lib_set]
        if repo_ids:
            repos = [r for r in repos if r["id"] in set(repo_ids)]
        if projects:
            pset = set(projects)
            repos = [r for r in repos if _project_of(r["full_name"]) in pset]
        if org_set is not None:
            repos = [r for r in repos if _org_of(acc, r["full_name"]) in org_set]
        if not repos:
            continue

        akey = f"account:{acc['id']}"
        add_node(akey, f"{acc['display_name'] or acc['username']} ({acc['provider']})", "account", 14)

        proj_repo_keys: dict[str, list[str]] = {}  # project -> visible repo node keys (for work items)
        for repo in repos:
            _proj = _project_of(repo["full_name"])
            _org = _org_of(acc, repo["full_name"])
            rid = repo["id"]
            proj_repo_keys.setdefault(_proj, []).append(f"repo:{rid}")
            rkey = f"repo:{rid}"
            ncommits = conn.execute("SELECT COUNT(*) n FROM commits WHERE repo_id=?", (rid,)).fetchone()["n"]
            add_node(rkey, repo["full_name"], "repo", 6 + math.log1p(ncommits) * 3, repo_id=rid, project=_proj, organization=_org)
            edges.append({"key": f"{akey}->{rkey}", "source": akey, "target": rkey})

            branch_keys: dict[str, str] = {}
            for br in conn.execute("SELECT * FROM branches WHERE repo_id=?", (rid,)).fetchall():
                bkey = f"branch:{br['id']}"
                branch_keys[br["name"]] = bkey
                add_node(bkey, br["name"], "branch", 3, repo_id=rid, project=_proj, organization=_org)
                edges.append({"key": f"{rkey}->{bkey}", "source": rkey, "target": bkey})

            for pr in conn.execute("SELECT * FROM pull_requests WHERE repo_id=?", (rid,)).fetchall():
                pkey = f"pr:{pr['id']}"
                add_node(pkey, f"#{pr['number']} {pr['title'] or ''}".strip(), "pr", 4, repo_id=rid, project=_proj)
                edges.append({"key": f"{rkey}->{pkey}", "source": rkey, "target": pkey})
                tgt = branch_keys.get(pr["target_branch"])
                if tgt:
                    edges.append({"key": f"{pkey}->{tgt}", "source": pkey, "target": tgt})

            # Focused repo -> expand its commits as individual nodes (author/AI-scoped if set).
            if focus_repo == rid:
                cw, ca = ["repo_id=?"], [rid]
                if authors:
                    cw.append(f"author IN ({','.join('?' * len(authors))})"); ca += authors
                if ai_agents:
                    cw.append(f"ai_agent IN ({','.join('?' * len(ai_agents))})"); ca += ai_agents
                rows = conn.execute(
                    f"SELECT sha, message, author, ai_agent FROM commits WHERE {' AND '.join(cw)} "
                    "ORDER BY committed_at DESC LIMIT ?", (*ca, EXPAND_COMMIT_CAP)).fetchall()
                for cm in rows:
                    ckey = f"commit:{rid}:{cm['sha']}"
                    label = (cm["message"] or cm["sha"]).splitlines()[0][:48]
                    add_node(ckey, label, "commit", 2, repo_id=rid, author=cm["author"],
                             project=_proj, ai_agent=cm["ai_agent"])
                    edges.append({"key": f"{rkey}->{ckey}", "source": rkey, "target": ckey})

        # Work items / issues → hung off their project's visible repos (skipped when a single
        # repo is focused, to keep the drill-down about that repo's commits).
        if focus_repo is None and not authors and not ai_agents:
            for wi in conn.execute("SELECT * FROM work_items WHERE account_id=?", (acc["id"],)).fetchall():
                repo_keys = proj_repo_keys.get(wi["project"])
                if not repo_keys:  # its project isn't in the current filter scope
                    continue
                _org = _org_of(acc, f"{wi['project']}/")
                wkey = f"wi:{wi['id']}"
                title = (wi["title"] or wi["external_id"])[:48]
                add_node(wkey, f"{wi['wtype'] or 'WI'} · {title}", "workitem", 3,
                         project=wi["project"], organization=_org)
                for rkey in repo_keys:
                    edges.append({"key": f"{rkey}->{wkey}", "source": rkey, "target": wkey})

    # --- Jira issues: a separate platform bridged to git via match.py links. Cross-account, so
    #     it runs after every git node exists and only draws to nodes actually in the (filtered)
    #     graph — an issue with no visible match simply doesn't appear.
    if focus_repo is None and not authors and not ai_agents:
        def ensure_target(kind, node_id):
            # A Jira match's git node (pr/branch/repo). Add it on demand if the current filter
            # didn't already include it, so selecting the Jira account still reveals the match.
            key = f"{kind}:{node_id}"
            if key in added:
                return key
            if kind == "repo":
                row = conn.execute("SELECT r.full_name, a.provider, a.username FROM repos r "
                                   "JOIN accounts a ON a.id=r.account_id WHERE r.id=?", (node_id,)).fetchone()
                if row:
                    add_node(key, row["full_name"], "repo", 8, repo_id=node_id,
                             project=_project_of(row["full_name"]), organization=_org_of(row, row["full_name"]))
                    return key
            elif kind == "branch":
                row = conn.execute("SELECT b.name, b.repo_id, r.full_name, a.provider, a.username FROM branches b "
                                   "JOIN repos r ON r.id=b.repo_id JOIN accounts a ON a.id=r.account_id "
                                   "WHERE b.id=?", (node_id,)).fetchone()
                if row:
                    add_node(key, row["name"], "branch", 3, repo_id=row["repo_id"],
                             project=_project_of(row["full_name"]), organization=_org_of(row, row["full_name"]))
                    return key
            elif kind == "pr":
                row = conn.execute("SELECT p.number, p.title, p.repo_id, r.full_name FROM pull_requests p "
                                   "JOIN repos r ON r.id=p.repo_id WHERE p.id=?", (node_id,)).fetchone()
                if row:
                    add_node(key, f"#{row['number']} {row['title'] or ''}".strip(), "pr", 4,
                             repo_id=row["repo_id"], project=_project_of(row["full_name"]))
                    return key
            return None

        for acc in (a for a in accounts if a["provider"] == "jira"):
            akey = f"account:{acc['id']}"
            acct_added = False
            rows = conn.execute(
                """SELECT w.id, w.external_id, w.title, w.project, l.node_kind, l.node_id
                   FROM work_items w JOIN work_item_links l ON l.work_item_id = w.id
                   WHERE w.account_id=? AND w.provider='jira'""", (acc["id"],)).fetchall()
            by_wi: dict[int, tuple] = {}
            for r in rows:
                tkey = ensure_target(r["node_kind"], r["node_id"])
                if tkey:
                    by_wi.setdefault(r["id"], (r, []))[1].append(tkey)
            for _wid, (r, tkeys) in by_wi.items():
                if not acct_added:
                    add_node(akey, f"{acc['display_name'] or acc['username']} (jira)", "account", 14)
                    acct_added = True
                wkey = f"wi:{r['id']}"
                title = (r["title"] or r["external_id"])[:48]
                add_node(wkey, f"{r['external_id']} · {title}", "workitem", 3, project=r["project"])
                edges.append({"key": f"{akey}->{wkey}", "source": akey, "target": wkey})
                for tkey in tkeys:
                    edges.append({"key": f"{wkey}->{tkey}", "source": wkey, "target": tkey})

    conn.close()
    return {"nodes": nodes, "edges": edges}
