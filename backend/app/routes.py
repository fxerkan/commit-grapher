from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import charts, config, crawler, db, graph, graphql_api, match, oauth

router = APIRouter(prefix="/api")

# Default owner URL per provider from a username/org (override with owner_url for
# self-hosted Gitea, Azure orgs, etc.).
OWNER_URL = {
    "github": "https://github.com/{u}",
    "gitlab": "https://gitlab.com/{u}",
    "codeberg": "https://codeberg.org/{u}",
    # bitbucket: no default — username is the Atlassian email, so owner_url (the workspace URL) is required.
    "azure": "https://dev.azure.com/{u}",
}


class AccountIn(BaseModel):
    provider: str
    username: str
    token: str
    owner_url: str | None = None


@router.get("/accounts")
def list_accounts():
    conn = db.connect()
    rows = conn.execute(
        "SELECT id, provider, username, display_name, owner_url, last_synced_at FROM accounts ORDER BY id"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/accounts")
def add_account(acc: AccountIn):
    owner_url = acc.owner_url or OWNER_URL.get(acc.provider, "").format(u=acc.username)
    if not owner_url:
        raise HTTPException(400, f"provide owner_url for provider '{acc.provider}'")
    ref = config.token_ref(acc.provider, acc.username)
    config.save_token(ref, acc.token.strip())
    conn = db.connect()
    try:
        # Re-adding an existing account updates its token/owner_url (lets you fix a bad PAT).
        existing = conn.execute(
            "SELECT id FROM accounts WHERE provider=? AND username=?", (acc.provider, acc.username)
        ).fetchone()
        if existing:
            conn.execute("UPDATE accounts SET owner_url=?, token_ref=? WHERE id=?",
                         (owner_url, ref, existing["id"]))
            conn.commit()
            return {"id": existing["id"], "updated": True}
        cur = conn.execute(
            """INSERT INTO accounts(provider, username, owner_url, token_ref, created_at)
               VALUES(?,?,?,?,?)""",
            (acc.provider, acc.username, owner_url, ref, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
        return {"id": cur.lastrowid}
    finally:
        conn.close()


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int):
    conn = db.connect()
    row = conn.execute("SELECT token_ref FROM accounts WHERE id=?", (account_id,)).fetchone()
    if row:
        config.delete_token(row["token_ref"])
    conn.execute("DELETE FROM accounts WHERE id=?", (account_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/accounts/{account_id}/sync")
def sync(account_id: int):
    try:
        return crawler.sync_account(account_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:  # surface crawl failures as JSON, not a plain-text 500
        raise HTTPException(502, f"{type(e).__name__}: {e}")


@router.post("/match")
def rematch():
    """Recompute Jira-issue <-> git links (commits/PRs/branches) across all accounts."""
    return {"links": match.rebuild_links()}


class OAuthStart(BaseModel):
    client_id: str


class OAuthPoll(BaseModel):
    client_id: str
    device_code: str


@router.post("/oauth/github/start")
def oauth_start(body: OAuthStart):
    try:
        return oauth.start(body.client_id.strip())
    except Exception as e:
        raise HTTPException(502, f"{type(e).__name__}: {e}")


@router.post("/oauth/github/poll")
def oauth_poll(body: OAuthPoll):
    try:
        return oauth.poll(body.client_id.strip(), body.device_code)
    except Exception as e:
        raise HTTPException(502, f"{type(e).__name__}: {e}")


def _pipe(s: str | None) -> list[str]:
    """Parse a `||`-separated multi-select param into a clean list."""
    return [x for x in (s.split("||") if s else []) if x]


@router.get("/graph")
def get_graph(provider: str | None = None, repo_id: int | None = None, authors: str | None = None,
              repo_ids: str | None = None, projects: str | None = None,
              organizations: str | None = None, account_ids: str | None = None,
              languages: str | None = None, libraries: str | None = None, ai_agents: str | None = None,
              start: str | None = None, end: str | None = None):
    author_list = _pipe(authors)
    rid_list = [int(x) for x in repo_ids.split(",") if x] if repo_ids else None
    proj_list = _pipe(projects)
    org_list = _pipe(organizations)
    acc_list = [int(x) for x in account_ids.split(",") if x] if account_ids else None
    return graph.build(provider=provider, focus_repo=repo_id, authors=author_list,
                       repo_ids=rid_list, projects=proj_list or None,
                       organizations=org_list or None, account_ids=acc_list,
                       languages=_pipe(languages) or None, libraries=_pipe(libraries) or None,
                       ai_agents=_pipe(ai_agents) or None, start=start or None, end=end or None)


class GraphQLIn(BaseModel):
    query: str
    variables: dict | None = None
    provider: str | None = None
    repo_id: int | None = None  # focused repo → its commits become queryable nodes


@router.post("/graphql")
def run_graphql(body: GraphQLIn):
    """Execute a GraphQL query over the network graph (nodes/edges). See graphql_api.SDL."""
    return graphql_api.execute(body.query, body.variables, body.provider, body.repo_id)


@router.get("/heatmap")
def get_heatmap(providers: str | None = None, repo_ids: str | None = None,
                authors: str | None = None, start: str | None = None, end: str | None = None,
                languages: str | None = None, libraries: str | None = None, ai_agents: str | None = None):
    plist = [p for p in (providers.split(",") if providers else []) if p]
    rids = [int(x) for x in repo_ids.split(",") if x] if repo_ids else None
    alist = _pipe(authors)
    return charts.heatmap(plist or None, rids, alist or None, start, end,
                          _pipe(languages) or None, _pipe(libraries) or None, _pipe(ai_agents) or None)


@router.get("/gitgraph")
def get_gitgraph(repo_id: int, limit: int = 200):
    return charts.gitgraph(repo_id, limit)


@router.get("/charts")
def get_charts(providers: str | None = None, repo_ids: str | None = None,
               authors: str | None = None, start: str | None = None, end: str | None = None,
               languages: str | None = None, libraries: str | None = None, ai_agents: str | None = None):
    plist = [p for p in (providers.split(",") if providers else []) if p]
    rids = [int(x) for x in repo_ids.split(",") if x] if repo_ids else None
    alist = _pipe(authors)
    return charts.stats(plist or None, rids, alist or None, start, end,
                        _pipe(languages) or None, _pipe(libraries) or None, _pipe(ai_agents) or None)


@router.get("/export")
def export_data():
    return charts.export_all()


@router.post("/import")
def import_data(payload: dict):
    try:
        return charts.import_all(payload)
    except Exception as e:
        raise HTTPException(400, f"invalid import file: {type(e).__name__}: {e}")


@router.get("/commits")
def get_commits(date: str | None = None, providers: str | None = None, repo_ids: str | None = None,
                authors: str | None = None, start: str | None = None, end: str | None = None, limit: int = 500,
                languages: str | None = None, libraries: str | None = None, ai_agents: str | None = None):
    plist = [p for p in (providers.split(",") if providers else []) if p]
    rids = [int(x) for x in repo_ids.split(",") if x] if repo_ids else None
    alist = _pipe(authors)
    return charts.commits_query(date, plist or None, rids, alist or None, start, end, limit,
                                _pipe(languages) or None, _pipe(libraries) or None, _pipe(ai_agents) or None)


import re as _re
_BOT = _re.compile(r"\[bot\]|bot$|claude|codex|copilot|dependabot|renovate|github-actions|-ci$", _re.I)


@router.get("/facets")
def get_facets(provider: str | None = None, projects: str | None = None, repo_ids: str | None = None,
               organizations: str | None = None, account_ids: str | None = None):
    """Sidebar filter values. When provider/organization/workspace/repo are given, the repos,
    branches, PRs and authors cascade (parent-child) to only what's in scope."""
    conn = db.connect()
    proj_sel = [p for p in (projects.split("||") if projects else []) if p]
    rid_sel = {int(x) for x in repo_ids.split(",") if x} if repo_ids else None
    org_sel = {o for o in (organizations.split("||") if organizations else []) if o}
    acc_sel = {int(x) for x in account_ids.split(",") if x} if account_ids else None

    accounts = [dict(a) for a in conn.execute("SELECT id, provider, username, display_name FROM accounts ORDER BY username")]
    acc_by_id = {a["id"]: a for a in accounts}
    providers = [r["provider"] for r in conn.execute("SELECT DISTINCT provider FROM repos ORDER BY provider")]

    repo_tags: dict[int, list[str]] = {}
    for r in conn.execute("SELECT repo_id, name FROM tags"):
        repo_tags.setdefault(r["repo_id"], []).append(r["name"])

    all_repos, projects_map, orgs_map = [], {}, {}
    for r in conn.execute("SELECT id, account_id, full_name, provider, languages, topics FROM repos ORDER BY full_name"):
        proj = r["full_name"].split("/", 1)[0] if "/" in r["full_name"] else r["full_name"]
        short = r["full_name"].split("/", 1)[1] if "/" in r["full_name"] else r["full_name"]
        acc = acc_by_id.get(r["account_id"], {})
        org = acc.get("username") if r["provider"] == "azure" else proj  # azure org / github owner
        projects_map[proj] = r["provider"]; orgs_map[org] = r["provider"]
        try:
            langs = list(json.loads(r["languages"] or "{}").keys())
        except (ValueError, TypeError):
            langs = []
        all_repos.append({"id": r["id"], "account_id": r["account_id"], "full_name": r["full_name"],
                          "provider": r["provider"], "project": proj, "repo": short, "organization": org,
                          "tags": repo_tags.get(r["id"], []), "languages": langs,
                          "libraries": [t for t in (r["topics"] or "").split(",") if t]})

    def in_scope(r, use_repo_ids=True):
        return ((not provider or r["provider"] == provider)
                and (not org_sel or r["organization"] in org_sel)
                and (not proj_sel or r["project"] in set(proj_sel))
                and (not acc_sel or r["account_id"] in acc_sel)
                and (not use_repo_ids or rid_sel is None or r["id"] in rid_sel))

    scoped_ids = [r["id"] for r in all_repos if in_scope(r)]
    ph = ",".join("?" * len(scoped_ids)) or "NULL"
    branches = [{"name": r["name"], "repo_id": r["repo_id"], "count": r["n"]} for r in conn.execute(
        f"SELECT name, repo_id, COUNT(*) n FROM branches WHERE repo_id IN ({ph}) GROUP BY name ORDER BY n DESC", scoped_ids)]
    prs = [{"id": r["id"], "number": r["number"], "title": r["title"], "repo_id": r["repo_id"]} for r in conn.execute(
        f"SELECT id, number, title, repo_id FROM pull_requests WHERE repo_id IN ({ph}) ORDER BY number DESC LIMIT 1000", scoped_ids)]
    authors = [{"name": r["author"], "count": r["n"], "bot": bool(_BOT.search(r["author"]))} for r in conn.execute(
        f"SELECT author, COUNT(*) n FROM commits WHERE author IS NOT NULL AND repo_id IN ({ph}) "
        "GROUP BY author ORDER BY n DESC", scoped_ids)]
    tags = [{"name": r["name"], "count": r["n"]} for r in conn.execute(
        f"SELECT name, COUNT(*) n FROM tags WHERE repo_id IN ({ph}) GROUP BY name ORDER BY n DESC", scoped_ids)]
    ai_agents = [{"name": r["ai_agent"], "count": r["n"]} for r in conn.execute(
        f"SELECT ai_agent, COUNT(*) n FROM commits WHERE ai_agent IS NOT NULL AND repo_id IN ({ph}) "
        "GROUP BY ai_agent ORDER BY n DESC", scoped_ids)]
    # Language/library facets = repo counts over the in-scope repos (cascades with the other dims).
    lang_ct, lib_ct = Counter(), Counter()
    for r in all_repos:
        if not in_scope(r):
            continue
        lang_ct.update(r["languages"]); lib_ct.update(r["libraries"])
    languages = [{"name": k, "count": v} for k, v in lang_ct.most_common()]
    libraries = [{"name": k, "count": v} for k, v in lib_ct.most_common()]
    conn.close()
    return {"providers": providers,
            "organizations": [{"name": k, "provider": v} for k, v in sorted(orgs_map.items())],
            "projects": [{"name": k, "provider": v} for k, v in sorted(projects_map.items())],
            "repos": [r for r in all_repos if in_scope(r, use_repo_ids=False)],
            "branches": branches, "prs": prs, "authors": authors, "tags": tags,
            "languages": languages, "libraries": libraries, "ai_agents": ai_agents,
            "accounts": [{"id": a["id"], "provider": a["provider"], "username": a["username"],
                          "display_name": a["display_name"] or a["username"]} for a in accounts],
            "account_names": [a["username"] for a in accounts]}


class RenameIn(BaseModel):
    display_name: str


@router.patch("/accounts/{account_id}")
def rename_account(account_id: int, body: RenameIn):
    conn = db.connect()
    conn.execute("UPDATE accounts SET display_name=? WHERE id=?", (body.display_name.strip() or None, account_id))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.get("/contributors")
def get_contributors(providers: str | None = None, repo_ids: str | None = None,
                     start: str | None = None, end: str | None = None,
                     languages: str | None = None, libraries: str | None = None, ai_agents: str | None = None,
                     identities: str | None = None):
    plist = [p for p in (providers.split(",") if providers else []) if p]
    rids = [int(x) for x in repo_ids.split(",") if x] if repo_ids else None
    return charts.contributors(plist or None, rids, start, end,
                               _pipe(languages) or None, _pipe(libraries) or None, _pipe(ai_agents) or None,
                               identities=_pipe(identities) or None)


@router.get("/contributors/detail")
def get_contributor_detail(login: str | None = None, repo_id: int | None = None,
                           providers: str | None = None, repo_ids: str | None = None,
                           start: str | None = None, end: str | None = None,
                           languages: str | None = None, libraries: str | None = None, ai_agents: str | None = None,
                           identities: str | None = None):
    plist = [p for p in (providers.split(",") if providers else []) if p]
    rids = [int(x) for x in repo_ids.split(",") if x] if repo_ids else None
    return charts.contributor_detail(login, repo_id, plist or None, rids, start, end,
                                     _pipe(languages) or None, _pipe(libraries) or None, _pipe(ai_agents) or None,
                                     identities=_pipe(identities) or None)


@router.get("/achievements")
def get_achievements():
    conn = db.connect()
    rows = conn.execute(
        "SELECT account_id, username, slug, name, tier, image_url FROM achievements ORDER BY account_id, tier DESC, slug"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.get("/summary")
def get_summary():
    return charts.summary()
