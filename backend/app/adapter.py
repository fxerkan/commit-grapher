"""Swappable per-provider adapters, all yielding the same normalized dataclasses.

- GitHubAdapter  -> GitHarbor (the only provider githarbor lists at account level).
  githarbor's Owner.list_repositories() drops the token, so we re-create each repo
  WITH the token before deep calls (else private repos fail / unauth rate limit).
- AzureDevOpsAdapter -> direct Azure DevOps REST (githarbor has no Azure owner module).

The crawler only knows this interface: list_repos / branches / pull_requests / commits.
Reads REST metadata only — never clones or reads file contents.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from urllib.parse import quote, urlparse

import httpx


@dataclass
class NormRepo:
    full_name: str
    url: str
    default_branch: str | None
    stars: int = 0
    forks: int = 0
    watchers: int = 0
    open_issues: int = 0
    language: str | None = None
    topics: tuple[str, ...] = field(default_factory=tuple)


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
    author_login: str | None = None   # provider handle (for contributor avatars/detail)
    author_avatar: str | None = None  # avatar URL when the provider exposes it


@dataclass
class NormWorkItem:
    """A work item / issue (Azure Boards, later Jira). Metadata only: titles + labels,
    related to a project so it can hang off that project's repos in the graph."""
    external_id: str
    wtype: str | None       # Bug / Task / User Story / Epic ...
    title: str | None
    state: str | None
    labels: str | None      # comma-separated tags/labels
    assignee: str | None
    url: str | None
    project: str | None     # relate to repos whose full_name starts with this project


def get_adapter(provider: str):
    if provider == "github":
        return GitHubAdapter()
    if provider == "azure":
        return AzureDevOpsAdapter()
    if provider == "jira":
        return JiraAdapter()
    if provider == "bitbucket":
        return BitbucketAdapter()
    if provider == "gitlab":
        return GitLabAdapter()
    if provider in ("gitea", "codeberg"):
        return GiteaAdapter()
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
    topics: tuple[str, ...] = field(default_factory=tuple)


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


def _gh_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}


def _gh_count(path: str, token: str, params: dict | None = None) -> int:
    """Total item count for a paginated list, read from the Link header's last page
    (per_page=1 → last-page number == item count). Avoids pulling the whole list."""
    try:
        r = httpx.get(f"{GH}{path}", params={**(params or {}), "per_page": 1}, headers=_gh_headers(token), timeout=30)
        if r.status_code != 200:
            return 0
        m = re.search(r'[?&]page=(\d+)>;\s*rel="last"', r.headers.get("link", ""))
        if m:
            return int(m.group(1))
        body = r.json()
        return len(body) if isinstance(body, list) else 0
    except Exception:  # noqa: BLE001
        return 0


def _gh_total_count(path: str, token: str) -> int:
    """`total_count` from an envelope endpoint (e.g. actions/runs)."""
    try:
        r = httpx.get(f"{GH}{path}", params={"per_page": 1}, headers=_gh_headers(token), timeout=30)
        return r.json().get("total_count", 0) if r.status_code == 200 else 0
    except Exception:  # noqa: BLE001
        return 0


def _gh_languages(full_name: str, token: str) -> dict:
    """`/languages` -> {lang: bytes}. Pure metadata (byte counts, no code). {} on failure."""
    try:
        r = httpx.get(f"{GH}/repos/{full_name}/languages", headers=_gh_headers(token), timeout=30)
        return r.json() if r.status_code == 200 and isinstance(r.json(), dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _gh_contrib_stats(full_name: str, token: str) -> dict:
    """`/stats/contributors` -> {login: {commits, additions, deletions}}. Line counts are
    metadata, not code. GitHub returns 202 while it computes stats — best-effort, {} then.
    # ponytail: GitHub-only, one extra call/repo; skip elsewhere."""
    try:
        r = httpx.get(f"{GH}/repos/{full_name}/stats/contributors", headers=_gh_headers(token), timeout=30)
        data = r.json() if r.status_code == 200 else None
        if not isinstance(data, list):
            return {}
        out = {}
        for c in data:
            login = (c.get("author") or {}).get("login")
            if not login:
                continue
            out[login] = {"commits": c.get("total", 0),
                          "additions": sum(w.get("a", 0) for w in c.get("weeks", [])),
                          "deletions": sum(w.get("d", 0) for w in c.get("weeks", []))}
        return out
    except Exception:  # noqa: BLE001
        return {}


def _npm_stats(full_name: str) -> dict:
    """Verified npm lookup: only counts downloads if the package on the registry links
    its repository back to THIS repo (no name-collision false positives)."""
    pkg = full_name.split("/")[-1]
    try:
        meta = httpx.get(f"https://registry.npmjs.org/{pkg}", timeout=15)
        if meta.status_code != 200:
            return {}
        repo_url = ((meta.json().get("repository") or {}).get("url") or "").lower()
        if full_name.lower() not in repo_url:
            return {}
        dl = httpx.get(f"https://api.npmjs.org/downloads/point/last-month/{pkg}", timeout=15)
        if dl.status_code == 200:
            return {"npm_downloads": dl.json().get("downloads", 0)}
    except Exception:  # noqa: BLE001
        pass
    return {}


_DOCKER_TOPIC = re.compile(r"docker|container|image|oci", re.I)


def _docker_stats(full_name: str, topics: tuple[str, ...]) -> dict:
    """Docker Hub pulls — only attempted when the repo advertises a docker/container topic,
    so we don't guess registry names for unrelated repos."""
    if not _DOCKER_TOPIC.search(" ".join(topics)):
        return {}
    ns, _, name = full_name.partition("/")
    try:
        r = httpx.get(f"https://hub.docker.com/v2/repositories/{ns.lower()}/{(name or ns).lower()}/", timeout=15)
        if r.status_code == 200:
            return {"docker_pulls": r.json().get("pull_count", 0)}
    except Exception:  # noqa: BLE001
        pass
    return {}


class GitHubAdapter:
    def list_repos(self, owner_url: str, token: str, username=None) -> list[tuple[NormRepo, GitHubHandle]]:
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
            topics = tuple(r.get("topics") or ())
            # stars/forks/watchers/etc. come free in the repo listing — no extra calls.
            norm = NormRepo(full, r.get("html_url", ""), r.get("default_branch"),
                            stars=r.get("stargazers_count") or 0, forks=r.get("forks_count") or 0,
                            watchers=r.get("subscribers_count") or r.get("watchers_count") or 0,
                            open_issues=r.get("open_issues_count") or 0,
                            language=r.get("language"), topics=topics)
            out.append((norm, GitHubHandle(full, r.get("default_branch"), token, topics)))
        return out

    def extras(self, h: GitHubHandle) -> dict:
        """Per-repo summary stats (extra API calls). Best-effort — the crawler wraps this
        in `safe()`, so any failure just leaves the stat null."""
        tags = [t["name"] for t in _gh_paginate(f"/repos/{h.full_name}/tags", h.token, max_pages=5)]
        releases = _gh_paginate(f"/repos/{h.full_name}/releases", h.token, max_pages=5)
        downloads = sum(a.get("download_count", 0) for rel in releases for a in rel.get("assets", []))
        out = {"tags": tags, "releases": len(releases), "downloads": downloads,
               "contributors": _gh_count(f"/repos/{h.full_name}/contributors", h.token, {"anon": "true"}),
               "builds": _gh_total_count(f"/repos/{h.full_name}/actions/runs", h.token),
               "languages": _gh_languages(h.full_name, h.token),          # {lang: bytes}
               "contrib_stats": _gh_contrib_stats(h.full_name, h.token)}  # {login: {commits,additions,deletions}}
        out.update(_npm_stats(h.full_name))       # only if the npm pkg links back to this repo
        out.update(_docker_stats(h.full_name, h.topics))  # only if a docker/container topic
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
            gh_user = c.get("author") or {}  # the linked GitHub account (null for non-GH authors)
            out.append(NormCommit(
                sha=c["sha"], author=a.get("name"), author_email=a.get("email"),
                message=(c.get("commit") or {}).get("message"), committed_at=_gh_dt(a.get("date")),
                url=c.get("html_url"),
                parents=",".join(p["sha"] for p in c.get("parents", [])),
                author_login=gh_user.get("login"), author_avatar=gh_user.get("avatar_url"),
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


def _az_post(url: str, token: str, body: dict, **params) -> dict:
    # WIQL needs POST; same PAT/basic-auth + no-redirect handling as _az_get.
    r = httpx.post(url, params=params, json=body, auth=("", token), timeout=30, follow_redirects=False)
    if 300 <= r.status_code < 400 and "_signin" in r.headers.get("location", ""):
        raise RuntimeError("Azure rejected the PAT (redirected to sign-in).")
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
    def list_repos(self, owner_url: str, token: str, username=None) -> list[tuple[NormRepo, AzureHandle]]:
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

    def extras(self, h: AzureHandle) -> dict:
        # Azure has no stars/forks/releases; expose tags so they still feed the filter + cloud.
        data = _az_get(f"{self._repo_url(h)}/refs", h.token, **{"api-version": "7.1", "filter": "tags/"})
        return {"tags": [r["name"].replace("refs/tags/", "") for r in data.get("value", [])]}

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

    # ponytail: newest 200 work items per project (WIQL id list → batched fields). Raise the
    # cap / add paging only if a real board needs the full backlog. Boards is readable even on
    # a Stakeholder license (unlike Code), so this works where commit crawl 401s.
    WI_CAP = 200
    WI_FIELDS = "System.Title,System.State,System.WorkItemType,System.Tags,System.AssignedTo"

    def work_items(self, owner_url: str, token: str, projects=None, username=None) -> list[NormWorkItem]:
        org_url = owner_url.rstrip("/")
        # Only query projects we actually crawled repos for (else a board with 26 projects
        # dumps thousands of unrelated items). Fall back to all projects if none given.
        if projects:
            names = list(projects)
        else:
            names = [p["name"] for p in
                     _az_get(f"{org_url}/_apis/projects", token, **{"api-version": "7.1"}).get("value", [])]
        out: list[NormWorkItem] = []
        for proj in names:
            wiql = _az_post(
                f"{org_url}/{proj}/_apis/wit/wiql", token,
                {"query": "SELECT [System.Id] FROM WorkItems ORDER BY [System.ChangedDate] DESC"},
                **{"api-version": "7.1", "$top": self.WI_CAP})
            ids = [str(w["id"]) for w in wiql.get("workItems", [])][:self.WI_CAP]
            for k in range(0, len(ids), 200):  # batch GET caps at 200 ids
                data = _az_get(f"{org_url}/_apis/wit/workitems", token,
                               ids=",".join(ids[k:k + 200]), fields=self.WI_FIELDS,
                               **{"api-version": "7.1"})
                for w in data.get("value", []):
                    f = w.get("fields", {})
                    who = f.get("System.AssignedTo")
                    out.append(NormWorkItem(
                        external_id=str(w["id"]),
                        wtype=f.get("System.WorkItemType"), title=f.get("System.Title"),
                        state=f.get("System.State"),
                        labels=(f.get("System.Tags") or "").replace("; ", ",") or None,
                        assignee=who.get("displayName") if isinstance(who, dict) else None,
                        url=f"{org_url}/{proj}/_workitems/edit/{w['id']}", project=proj))
        return out


# --------------------------------------------------------------------------- #
# Jira Cloud (direct REST) — a *separate* platform from the VCS. It has no git repos;
# it only yields work_items (issues), which match.py then relates to commits/PRs/branches.
# account.username = Atlassian email, account.owner_url = https://<site>.atlassian.net,
# token = API token. Auth = HTTP Basic(email, token).
# --------------------------------------------------------------------------- #
JIRA_PAGE = 100
JIRA_CAP = 2000  # ponytail: newest ~2000 issues; raise / add project filter if a board needs more.
# Enhanced /search/jql rejects unbounded JQL, so bound to a recent window (also the relevant
# scope for matching against recent commits). ponytail: widen the window if older issues matter.
JIRA_JQL = "updated >= -365d ORDER BY updated DESC"


class JiraAdapter:
    def list_repos(self, owner_url: str, token: str):
        return []  # Jira has no git repos — the crawler's repo loop simply no-ops.

    def work_items(self, owner_url: str, token: str, projects=None, username=None) -> list[NormWorkItem]:
        site = owner_url.rstrip("/")
        auth = (username or "", token)
        headers = {"Accept": "application/json"}
        out: list[NormWorkItem] = []
        next_token = None
        # Atlassian retired classic /search (410 Gone); enhanced /search/jql uses a nextPageToken
        # cursor + isLast instead of startAt/total.
        while len(out) < JIRA_CAP:
            params = {"jql": JIRA_JQL, "maxResults": JIRA_PAGE,
                      "fields": "summary,status,issuetype,labels,assignee,project"}
            if next_token:
                params["nextPageToken"] = next_token
            r = httpx.get(f"{site}/rest/api/3/search/jql", auth=auth, headers=headers, timeout=30, params=params)
            r.raise_for_status()
            data = r.json()
            issues = data.get("issues", [])
            for it in issues:
                f = it.get("fields", {})
                out.append(NormWorkItem(
                    external_id=it["key"],
                    wtype=(f.get("issuetype") or {}).get("name"),
                    title=f.get("summary"),
                    state=(f.get("status") or {}).get("name"),
                    labels=",".join(f.get("labels") or []) or None,
                    assignee=(f.get("assignee") or {}).get("displayName"),
                    url=f"{site}/browse/{it['key']}",
                    project=(f.get("project") or {}).get("key") or it["key"].split("-", 1)[0]))
            next_token = data.get("nextPageToken")
            if data.get("isLast") or not next_token or not issues:
                break
        return out


# --------------------------------------------------------------------------- #
# Bitbucket Cloud (direct REST v2). handle carries workspace/slug/token/auth-user.
# Auth = HTTP Basic(login, secret) — works identically for an app password or the
# newer Atlassian API token (the login is a username or the account email).
# owner_url = https://bitbucket.org/{workspace}; account.username = the Basic login.
# ponytail: assumes login can read the workspace's repos (true for a personal workspace
# where login == workspace). For an org workspace with a distinct login, set username to
# that login and owner_url to the workspace.
# --------------------------------------------------------------------------- #
BB = "https://api.bitbucket.org/2.0"
_BB_AUTHOR = re.compile(r"^\s*(?P<name>.*?)\s*<(?P<email>[^>]*)>\s*$")


@dataclass
class BitbucketHandle:
    workspace: str
    slug: str
    default_branch: str | None
    token: str
    auth_user: str


def _bb_ws(owner_url: str) -> str:
    return owner_url.rstrip("/").split("/")[-1]  # .../{workspace}


def _bb_authargs(user: str, token: str) -> dict:
    """Bitbucket auth: a scoped API token / app password authenticates as Basic (email or
    username + secret); a workspace/repository *access token* authenticates as Bearer. A blank
    username signals an access token -> Bearer."""
    return {"auth": (user, token)} if user else {"headers": {"Authorization": f"Bearer {token}"}}


def _bb_paginate(url: str, authargs: dict, params: dict | None = None, max_pages: int = 50) -> list:
    """Follow Bitbucket's `next` cursor (absolute URLs) and concat the `values` arrays."""
    out: list = []
    for _ in range(max_pages):
        r = httpx.get(url, params=params, timeout=30, **authargs)
        r.raise_for_status()
        data = r.json()
        out.extend(data.get("values", []))
        url = data.get("next")
        params = None  # the `next` URL already carries paging params
        if not url:
            break
    return out


def _bb_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


class BitbucketAdapter:
    def list_repos(self, owner_url: str, token: str, username=None) -> list[tuple[NormRepo, BitbucketHandle]]:
        ws = _bb_ws(owner_url)
        auth_user = (username or "").strip()  # email/username -> Basic; blank -> Bearer access token
        out: list[tuple[NormRepo, BitbucketHandle]] = []
        for r in _bb_paginate(f"{BB}/repositories/{ws}", _bb_authargs(auth_user, token),
                              {"pagelen": 100, "sort": "-updated_on"}):
            default = (r.get("mainbranch") or {}).get("name")
            html = ((r.get("links") or {}).get("html") or {}).get("href", "")
            norm = NormRepo(r["full_name"], html, default, language=r.get("language") or None)
            out.append((norm, BitbucketHandle(ws, r["slug"], default, token, auth_user)))
        return out

    def _auth(self, h: BitbucketHandle) -> dict:
        return _bb_authargs(h.auth_user, h.token)

    def _repo(self, h: BitbucketHandle) -> str:
        return f"{BB}/repositories/{h.workspace}/{h.slug}"

    def extras(self, h: BitbucketHandle) -> dict:
        tags = _bb_paginate(f"{self._repo(h)}/refs/tags", self._auth(h), {"pagelen": 100}, max_pages=5)
        return {"tags": [t["name"] for t in tags]}

    def branches(self, h: BitbucketHandle) -> list[NormBranch]:
        return [NormBranch(b["name"]) for b in
                _bb_paginate(f"{self._repo(h)}/refs/branches", self._auth(h), {"pagelen": 100})]

    def pull_requests(self, h: BitbucketHandle) -> list[NormPR]:
        out = []
        for p in _bb_paginate(f"{self._repo(h)}/pullrequests", self._auth(h),
                              {"pagelen": 50, "state": ["MERGED", "OPEN", "DECLINED", "SUPERSEDED"]}):
            state = (p.get("state") or "").lower()
            out.append(NormPR(
                number=p["id"], title=p.get("title"), state="merged" if state == "merged" else state,
                author=(p.get("author") or {}).get("display_name"),
                source_branch=((p.get("source") or {}).get("branch") or {}).get("name"),
                target_branch=((p.get("destination") or {}).get("branch") or {}).get("name"),
                created_at=_bb_dt(p.get("created_on")),
                merged_at=_bb_dt(p.get("updated_on")) if state == "merged" else None,
            ))
        return out

    def commits(self, h: BitbucketHandle, branch=None, since=None, max_pages=5) -> list[NormCommit]:
        # /commits/{branch} walks first-parent history from that ref; /commits = default branch.
        url = f"{self._repo(h)}/commits/{branch}" if branch else f"{self._repo(h)}/commits"
        out = []
        for c in _bb_paginate(url, self._auth(h), {"pagelen": 100}, max_pages=max_pages or 5):
            raw = (c.get("author") or {}).get("raw", "") or ""
            m = _BB_AUTHOR.match(raw)
            name = (m.group("name") if m else raw) or (c.get("author") or {}).get("user", {}).get("display_name")
            email = m.group("email") if m else None
            out.append(NormCommit(
                sha=c["hash"], author=name or None, author_email=email,
                message=c.get("message"), committed_at=_bb_dt(c.get("date")),
                url=((c.get("links") or {}).get("html") or {}).get("href"),
                parents=",".join(p["hash"] for p in c.get("parents", [])),
            ))
        return out


# --------------------------------------------------------------------------- #
# GitLab (REST v4). owner_url = https://gitlab.com/{namespace} (or a self-hosted host);
# namespace can be a user or a group. Auth = PRIVATE-TOKEN header (public repos need none).
# --------------------------------------------------------------------------- #
@dataclass
class GitLabHandle:
    api: str            # https://{host}/api/v4
    pid: int            # numeric project id
    default_branch: str | None
    token: str


def _gl_parse(owner_url: str) -> tuple[str, str]:
    u = urlparse(owner_url.rstrip("/"))
    return f"{u.scheme}://{u.netloc}/api/v4", u.path.strip("/")


def _gl_headers(token: str) -> dict:
    return {"PRIVATE-TOKEN": token} if token else {}


def _gl_paginate(url: str, token: str, params: dict | None = None, max_pages: int = 20) -> list:
    """GitLab keeps paging in the X-Next-Page header; stop when it's empty. 404/401 -> []."""
    out: list = []
    params = {**(params or {}), "per_page": 100, "page": 1}
    for _ in range(max_pages):
        r = httpx.get(url, params=params, headers=_gl_headers(token), timeout=30)
        if r.status_code in (401, 403, 404):
            break
        r.raise_for_status()
        body = r.json()
        if not isinstance(body, list) or not body:
            break
        out.extend(body)
        nxt = r.headers.get("x-next-page")
        if not nxt:
            break
        params["page"] = nxt
    return out


class GitLabAdapter:
    def list_repos(self, owner_url: str, token: str, username=None) -> list[tuple[NormRepo, GitLabHandle]]:
        api, ns = _gl_parse(owner_url)
        ns_enc = quote(ns, safe="")
        seen: dict[int, dict] = {}
        # A namespace is a group OR a user — try both, dedupe by project id.
        for path, extra in ((f"/groups/{ns_enc}/projects", {"include_subgroups": "true"}),
                            (f"/users/{ns_enc}/projects", {})):
            for p in _gl_paginate(f"{api}{path}", token, extra):
                seen.setdefault(p["id"], p)
        out: list[tuple[NormRepo, GitLabHandle]] = []
        for p in seen.values():
            out.append((NormRepo(p["path_with_namespace"], p.get("web_url", ""), p.get("default_branch")),
                        GitLabHandle(api, p["id"], p.get("default_branch"), token)))
        return out

    def _p(self, h: GitLabHandle) -> str:
        return f"{h.api}/projects/{h.pid}"

    def extras(self, h: GitLabHandle) -> dict:
        tags = _gl_paginate(f"{self._p(h)}/repository/tags", h.token, max_pages=5)
        return {"tags": [t["name"] for t in tags]}

    def branches(self, h: GitLabHandle) -> list[NormBranch]:
        return [NormBranch(b["name"]) for b in _gl_paginate(f"{self._p(h)}/repository/branches", h.token)]

    def pull_requests(self, h: GitLabHandle) -> list[NormPR]:
        out = []
        for m in _gl_paginate(f"{self._p(h)}/merge_requests", h.token, {"state": "all"}):
            st = m.get("state")
            out.append(NormPR(
                number=m["iid"], title=m.get("title"),
                state="merged" if st == "merged" else ("open" if st == "opened" else st),
                author=(m.get("author") or {}).get("name"),
                source_branch=m.get("source_branch"), target_branch=m.get("target_branch"),
                created_at=_gl_dt(m.get("created_at")), merged_at=_gl_dt(m.get("merged_at")),
            ))
        return out

    def commits(self, h: GitLabHandle, branch=None, since=None, max_pages=20) -> list[NormCommit]:
        params = {}
        if branch:
            params["ref_name"] = branch
        if since:
            params["since"] = since.isoformat()
        out = []
        for c in _gl_paginate(f"{self._p(h)}/repository/commits", h.token, params, max_pages=max_pages or 20):
            out.append(NormCommit(
                sha=c["id"], author=c.get("author_name"), author_email=c.get("author_email"),
                message=c.get("message") or c.get("title"), committed_at=_gl_dt(c.get("created_at")),
                url=c.get("web_url"), parents=",".join(c.get("parent_ids") or []),
            ))
        return out


def _gl_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None


# --------------------------------------------------------------------------- #
# Gitea / Codeberg (Gitea API v1 — Codeberg is a hosted Gitea). owner_url =
# https://codeberg.org/{owner} or a self-hosted host. Auth = token header (public needs none).
# --------------------------------------------------------------------------- #
@dataclass
class GiteaHandle:
    api: str            # https://{host}/api/v1
    owner: str
    repo: str
    default_branch: str | None
    token: str


def _gt_parse(owner_url: str) -> tuple[str, str]:
    u = urlparse(owner_url.rstrip("/"))
    return f"{u.scheme}://{u.netloc}/api/v1", u.path.strip("/")


def _gt_headers(token: str) -> dict:
    return {"Authorization": f"token {token}"} if token else {}


def _gt_paginate(url: str, token: str, params: dict | None = None, max_pages: int = 20) -> list:
    out: list = []
    params = {**(params or {}), "limit": 50, "page": 1}
    for _ in range(max_pages):
        r = httpx.get(url, params=params, headers=_gt_headers(token), timeout=30)
        if r.status_code in (401, 403, 404):
            break
        r.raise_for_status()
        body = r.json()
        # Some Gitea list endpoints wrap results under "data" (e.g. pulls); most return a bare list.
        items = body.get("data") if isinstance(body, dict) else body
        if not items:
            break
        out.extend(items)
        if len(items) < params["limit"]:
            break
        params["page"] += 1
    return out


class GiteaAdapter:
    def list_repos(self, owner_url: str, token: str, username=None) -> list[tuple[NormRepo, GiteaHandle]]:
        api, owner = _gt_parse(owner_url)
        # /users/{owner}/repos covers a user; /orgs/{owner}/repos covers an org — try both.
        seen: dict[str, dict] = {}
        for path in (f"/users/{owner}/repos", f"/orgs/{owner}/repos"):
            for r in _gt_paginate(f"{api}{path}", token):
                seen.setdefault(r["full_name"], r)
        out: list[tuple[NormRepo, GiteaHandle]] = []
        for r in seen.values():
            o, name = r["full_name"].split("/", 1) if "/" in r["full_name"] else (owner, r["name"])
            out.append((NormRepo(r["full_name"], r.get("html_url", ""), r.get("default_branch"),
                                  stars=r.get("stars_count") or 0, forks=r.get("forks_count") or 0,
                                  language=r.get("language") or None),
                        GiteaHandle(api, o, name, r.get("default_branch"), token)))
        return out

    def _r(self, h: GiteaHandle) -> str:
        return f"{h.api}/repos/{h.owner}/{h.repo}"

    def extras(self, h: GiteaHandle) -> dict:
        tags = _gt_paginate(f"{self._r(h)}/tags", h.token, max_pages=5)
        return {"tags": [t["name"] for t in tags]}

    def branches(self, h: GiteaHandle) -> list[NormBranch]:
        return [NormBranch(b["name"]) for b in _gt_paginate(f"{self._r(h)}/branches", h.token)]

    def pull_requests(self, h: GiteaHandle) -> list[NormPR]:
        out = []
        for p in _gt_paginate(f"{self._r(h)}/pulls", h.token, {"state": "all"}):
            out.append(NormPR(
                number=p["number"], title=p.get("title"),
                state="merged" if p.get("merged") else p.get("state"),
                author=(p.get("user") or {}).get("login") or (p.get("user") or {}).get("username"),
                source_branch=(p.get("head") or {}).get("ref"), target_branch=(p.get("base") or {}).get("ref"),
                created_at=_gl_dt(p.get("created_at")), merged_at=_gl_dt(p.get("merged_at")),
            ))
        return out

    def commits(self, h: GiteaHandle, branch=None, since=None, max_pages=20) -> list[NormCommit]:
        params = {"stat": "false", "verification": "false", "files": "false"}
        if branch:
            params["sha"] = branch
        out = []
        for c in _gt_paginate(f"{self._r(h)}/commits", h.token, params, max_pages=max_pages or 20):
            commit = c.get("commit") or {}
            a = commit.get("author") or {}
            out.append(NormCommit(
                sha=c["sha"], author=a.get("name"), author_email=a.get("email"),
                message=commit.get("message"), committed_at=_gl_dt(a.get("date")),
                url=c.get("html_url"), parents=",".join(p["sha"] for p in c.get("parents", [])),
            ))
        return out
