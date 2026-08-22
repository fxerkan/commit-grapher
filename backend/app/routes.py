from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import charts, config, crawler, db, graph, oauth

router = APIRouter(prefix="/api")

# Default owner URL per provider from a username/org (override with owner_url for
# self-hosted Gitea, Azure orgs, etc.).
OWNER_URL = {
    "github": "https://github.com/{u}",
    "gitlab": "https://gitlab.com/{u}",
    "codeberg": "https://codeberg.org/{u}",
    "bitbucket": "https://bitbucket.org/{u}",
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
        "SELECT id, provider, username, owner_url, last_synced_at FROM accounts ORDER BY id"
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


@router.get("/graph")
def get_graph(provider: str | None = None, repo_id: int | None = None, authors: str | None = None,
              repo_ids: str | None = None, projects: str | None = None):
    author_list = [a for a in (authors.split("||") if authors else []) if a]
    rid_list = [int(x) for x in repo_ids.split(",") if x] if repo_ids else None
    proj_list = [p for p in (projects.split("||") if projects else []) if p]
    return graph.build(provider=provider, focus_repo=repo_id, authors=author_list,
                       repo_ids=rid_list, projects=proj_list or None)


@router.get("/heatmap")
def get_heatmap(provider: str | None = None, repo_id: int | None = None, author: str | None = None):
    return charts.heatmap(provider, repo_id, author)


@router.get("/gitgraph")
def get_gitgraph(repo_id: int, limit: int = 200):
    return charts.gitgraph(repo_id, limit)


@router.get("/charts")
def get_charts(provider: str | None = None, repo_id: int | None = None, author: str | None = None):
    return charts.stats(provider, repo_id, author)


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
def get_commits(date: str | None = None, provider: str | None = None,
                repo_id: int | None = None, author: str | None = None, limit: int = 500):
    return charts.commits_query(date, provider, repo_id, author, limit)


import re as _re
_BOT = _re.compile(r"\[bot\]|bot$|claude|codex|copilot|dependabot|renovate|github-actions|-ci$", _re.I)


@router.get("/facets")
def get_facets(provider: str | None = None, projects: str | None = None, repo_ids: str | None = None):
    """Sidebar filter values. When provider/projects/repo_ids are given, the repos, branches
    and authors cascade (parent-child): pick a project -> only its repos/branches/authors show."""
    conn = db.connect()
    proj_sel = [p for p in (projects.split("||") if projects else []) if p]
    rid_sel = {int(x) for x in repo_ids.split(",") if x} if repo_ids else None

    providers = [r["provider"] for r in conn.execute("SELECT DISTINCT provider FROM repos ORDER BY provider")]
    all_repos, projects_map = [], {}
    for r in conn.execute("SELECT id, full_name, provider FROM repos ORDER BY full_name"):
        proj = r["full_name"].split("/", 1)[0] if "/" in r["full_name"] else r["full_name"]
        short = r["full_name"].split("/", 1)[1] if "/" in r["full_name"] else r["full_name"]
        projects_map[proj] = r["provider"]
        all_repos.append({"id": r["id"], "full_name": r["full_name"], "provider": r["provider"], "project": proj, "repo": short})

    # Cascade: repos in scope drive branches/authors.
    scoped = [r for r in all_repos
              if (not provider or r["provider"] == provider)
              and (not proj_sel or r["project"] in set(proj_sel))
              and (rid_sel is None or r["id"] in rid_sel)]
    scoped_ids = {r["id"] for r in scoped}
    ph = ",".join("?" * len(scoped_ids)) or "NULL"
    ids = list(scoped_ids)
    branches = [{"name": r["name"], "repo_id": r["repo_id"], "count": r["n"]} for r in conn.execute(
        f"SELECT name, repo_id, COUNT(*) n FROM branches WHERE repo_id IN ({ph}) GROUP BY name ORDER BY n DESC", ids)]
    authors = [{"name": r["author"], "count": r["n"], "bot": bool(_BOT.search(r["author"]))} for r in conn.execute(
        f"SELECT author, COUNT(*) n FROM commits WHERE author IS NOT NULL AND repo_id IN ({ph}) "
        "GROUP BY author ORDER BY n DESC", ids)]
    account_names = [r["username"] for r in conn.execute("SELECT username FROM accounts")]
    conn.close()
    return {"providers": providers,
            "projects": [{"name": k, "provider": v} for k, v in sorted(projects_map.items())],
            "repos": [r for r in all_repos if (not provider or r["provider"] == provider) and (not proj_sel or r["project"] in set(proj_sel))],
            "branches": branches, "authors": authors, "account_names": account_names}


@router.get("/summary")
def get_summary():
    return charts.summary()
