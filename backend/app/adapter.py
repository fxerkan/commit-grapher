"""Swappable per-provider adapters, all yielding the same normalized dataclasses.

- GitHubAdapter  -> GitHarbor (the only provider githarbor lists at account level).
  githarbor's Owner.list_repositories() drops the token, so we re-create each repo
  WITH the token before deep calls (else private repos fail / unauth rate limit).
- AzureDevOpsAdapter -> direct Azure DevOps REST (githarbor has no Azure owner module).

The crawler only knows this interface: list_repos / branches / pull_requests / commits.
Reads REST metadata only — never clones or reads file contents.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import httpx


@dataclass
class NormRepo:
    full_name: str
    url: str
    default_branch: str | None


@dataclass
class NormBranch:
    name: str


@dataclass
class NormPR:
    number: int
    title: str | None
    state: str | None
    author: str | None
    source_branch: str | None
    target_branch: str | None
    created_at: datetime | None
    merged_at: datetime | None


@dataclass
class NormCommit:
    sha: str
    author: str | None
    author_email: str | None
    message: str | None
    committed_at: datetime | None
    url: str | None = None
    parents: str | None = None  # comma-separated parent SHAs


def get_adapter(provider: str):
    if provider == "github":
        return GitHubAdapter()
    if provider == "azure":
        return AzureDevOpsAdapter()
    raise ValueError(f"no adapter for provider '{provider}' yet")


# --------------------------------------------------------------------------- #
# GitHub (direct REST) — githarbor's github owner needs PyGithub AND drops the
# token on list_repositories, so we use the REST API directly like Azure.
# handle = GitHubHandle(full_name, token)
# --------------------------------------------------------------------------- #
GH = "https://api.github.com"
MAX_COMMIT_PAGES = 20  # ponytail: cap ~2000 commits/repo/branch; raise if deep history needed.


@dataclass
class GitHubHandle:
    full_name: str
    default_branch: str | None
    token: str


def _gh_paginate(path: str, token: str, params: dict | None = None, max_pages: int = 100) -> list:
    """Follow GitHub pagination (per_page=100) and return the concatenated JSON arrays."""
    out: list = []
    params = {**(params or {}), "per_page": 100, "page": 1}
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    for _ in range(max_pages):
        r = httpx.get(f"{GH}{path}", params=params, headers=headers, timeout=30)
        r.raise_for_status()
        page = r.json()
        if not page:
            break
        out.extend(page)
        if len(page) < 100:
            break
        params["page"] += 1
    return out


def _gh_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


class GitHubAdapter:
    def list_repos(self, owner_url: str, token: str) -> list[tuple[NormRepo, GitHubHandle]]:
        # Authenticated user's repos (owner + collaborator + org member).
        repos = _gh_paginate("/user/repos", token, {"affiliation": "owner,collaborator,organization_member"})
        # Also enumerate each org the user belongs to (catches org repos like datapiai/finevertech
        # that /user/repos may omit depending on membership visibility).
        seen = {r["full_name"] for r in repos}
        for org in _gh_paginate("/user/orgs", token):
            for r in _gh_paginate(f"/orgs/{org['login']}/repos", token):
                if r["full_name"] not in seen:
                    seen.add(r["full_name"]); repos.append(r)
        out: list[tuple[NormRepo, GitHubHandle]] = []
        for r in repos:
            full = r["full_name"]
            out.append((NormRepo(full, r.get("html_url", ""), r.get("default_branch")),
                        GitHubHandle(full, r.get("default_branch"), token)))
        return out

    def branches(self, h: GitHubHandle) -> list[NormBranch]:
        return [NormBranch(b["name"]) for b in _gh_paginate(f"/repos/{h.full_name}/branches", h.token)]

    def pull_requests(self, h: GitHubHandle) -> list[NormPR]:
        out = []
        for p in _gh_paginate(f"/repos/{h.full_name}/pulls", h.token, {"state": "all"}):
            out.append(NormPR(
                number=p["number"], title=p.get("title"),
                state="merged" if p.get("merged_at") else p.get("state"),
                author=(p.get("user") or {}).get("login"),
                source_branch=(p.get("head") or {}).get("ref"),
                target_branch=(p.get("base") or {}).get("ref"),
                created_at=_gh_dt(p.get("created_at")), merged_at=_gh_dt(p.get("merged_at")),
            ))
        return out

    def commits(self, h: GitHubHandle, branch=None, since=None, max_pages=MAX_COMMIT_PAGES) -> list[NormCommit]:
        params = {}
        if branch:
            params["sha"] = branch
        if since:
            params["since"] = since.isoformat()
        out = []
        for c in _gh_paginate(f"/repos/{h.full_name}/commits", h.token, params, max_pages=max_pages):
            a = (c.get("commit") or {}).get("author") or {}
            out.append(NormCommit(
                sha=c["sha"], author=a.get("name"), author_email=a.get("email"),
                message=(c.get("commit") or {}).get("message"), committed_at=_gh_dt(a.get("date")),
                url=c.get("html_url"),
                parents=",".join(p["sha"] for p in c.get("parents", [])),
            ))
        return out


# --------------------------------------------------------------------------- #
# Azure DevOps (direct REST) — handle carries org/project/repo_id/token
# --------------------------------------------------------------------------- #
API = "api-version=7.1"


@dataclass
class AzureHandle:
    org_url: str          # https://dev.azure.com/{org}
    project: str
    repo_id: str
    token: str


def _az_get(url: str, token: str, **params) -> dict:
    # Azure DevOps PAT auth = HTTP Basic with empty username. Don't follow redirects:
    # a 302 to _signin means the PAT was rejected (empty/invalid, or the org enforces
    # Entra interactive sign-in and has PAT/basic-auth disabled).
    r = httpx.get(url, params=params, auth=("", token), timeout=30, follow_redirects=False)
    if 300 <= r.status_code < 400 and "_signin" in r.headers.get("location", ""):
        raise RuntimeError(
            "Azure rejected the PAT (redirected to sign-in). Check the token is valid and "
            "the org allows PAT/basic auth (some Entra-secured orgs disable it)."
        )
    r.raise_for_status()
    return r.json()


def _az_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


class AzureDevOpsAdapter:
    def list_repos(self, owner_url: str, token: str) -> list[tuple[NormRepo, AzureHandle]]:
        org_url = owner_url.rstrip("/")  # https://dev.azure.com/{org}
        data = _az_get(f"{org_url}/_apis/git/repositories", token, **{"api-version": "7.1"})
        out: list[tuple[NormRepo, AzureHandle]] = []
        for repo in data.get("value", []):
            project = repo["project"]["name"]
            default = (repo.get("defaultBranch") or "").replace("refs/heads/", "") or None
            handle = AzureHandle(org_url, project, repo["id"], token)
            out.append((NormRepo(f"{project}/{repo['name']}", repo.get("webUrl") or repo.get("remoteUrl", ""), default), handle))
        return out

    def _repo_url(self, h: AzureHandle) -> str:
        return f"{h.org_url}/{h.project}/_apis/git/repositories/{h.repo_id}"

    def branches(self, h: AzureHandle) -> list[NormBranch]:
        data = _az_get(f"{self._repo_url(h)}/refs", h.token, **{"api-version": "7.1", "filter": "heads/"})
        return [NormBranch(r["name"].replace("refs/heads/", "")) for r in data.get("value", [])]

    def pull_requests(self, h: AzureHandle) -> list[NormPR]:
        data = _az_get(f"{self._repo_url(h)}/pullrequests", h.token,
                       **{"api-version": "7.1", "searchCriteria.status": "all", "$top": 200})
        out = []
        for p in data.get("value", []):
            out.append(NormPR(
                number=p["pullRequestId"], title=p.get("title"),
                state=p.get("status"), author=(p.get("createdBy") or {}).get("displayName"),
                source_branch=(p.get("sourceRefName") or "").replace("refs/heads/", ""),
                target_branch=(p.get("targetRefName") or "").replace("refs/heads/", ""),
                created_at=_az_dt(p.get("creationDate")), merged_at=_az_dt(p.get("closedDate")),
            ))
        return out

    def commits(self, h: AzureHandle, branch=None, since=None, max_pages=None) -> list[NormCommit]:
        top = 200 if max_pages == 1 else 1000  # smaller pull for secondary branches
        params = {"api-version": "7.1", "searchCriteria.$top": top}
        if branch:
            params["searchCriteria.itemVersion.version"] = branch
        if since:
            params["searchCriteria.fromDate"] = since.isoformat()
        data = _az_get(f"{self._repo_url(h)}/commits", h.token, **params)
        out = []
        for c in data.get("value", []):
            a = c.get("author") or {}
            out.append(NormCommit(
                sha=c["commitId"], author=a.get("name"), author_email=a.get("email"),
                message=c.get("comment"), committed_at=_az_dt(a.get("date")),
                url=c.get("remoteUrl"),
                parents=",".join(c.get("parents", []) or []),
            ))
        return out
