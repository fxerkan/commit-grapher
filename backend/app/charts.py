"""Aggregations for the contribution heatmap and other charts.

Daily buckets are computed from commit timestamps in the commit's own timezone
(what GitHub-style graphs show), so a commit at 23:30+02:00 counts on that local day.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from itertools import combinations

from . import db

_CLOSED_STATE = re.compile(r"done|closed|resolved|complete|cancel", re.I)


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


def heatmap(providers: list[str] | None = None, repo_ids: list[int] | None = None,
            authors: list[str] | None = None, start: str | None = None,
            end: str | None = None, languages: list[str] | None = None,
            libraries: list[str] | None = None, ai_agents: list[str] | None = None) -> dict[str, int]:
    conn = db.connect()
    cw, args = _commit_where(providers, repo_ids, authors, start, end, languages, libraries, ai_agents)
    rows = conn.execute(
        f"SELECT c.committed_at FROM commits c JOIN repos r ON c.repo_id=r.id WHERE {cw}", args).fetchall()
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


def commits_query(date: str | None = None, providers: list[str] | None = None,
                  repo_ids: list[int] | None = None, authors: list[str] | None = None,
                  start: str | None = None, end: str | None = None, limit: int = 500,
                  languages: list[str] | None = None, libraries: list[str] | None = None,
                  ai_agents: list[str] | None = None) -> list[dict]:
    """Filterable commit list — powers heatmap day drill-down and cross-filtering.
    date = 'YYYY-MM-DD' matches the commit's local day (committed_at starts with it)."""
    conn = db.connect()
    cw, args = _commit_where(providers, repo_ids, authors, start, end, languages, libraries, ai_agents)
    sql = ["SELECT c.sha, c.author, c.author_email, c.message, c.committed_at, c.branch_ref, c.url, c.parents,",
           "c.ai_agent, c.ai_role,",
           f"r.full_name AS repo, r.provider FROM commits c JOIN repos r ON c.repo_id=r.id WHERE {cw}"]
    if date:
        sql.append("AND substr(c.committed_at,1,10)=?"); args.append(date)
    sql.append("ORDER BY c.committed_at DESC LIMIT ?"); args.append(limit)
    rows = conn.execute(" ".join(sql), args).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def _repo_match_sql(languages: list[str] | None, libraries: list[str] | None) -> tuple[list[str], list]:
    """Repo-level filter fragments over alias `r`. Languages match keys in the r.languages
    JSON ({"Python": bytes,…}); libraries match a repo topic in the comma-separated r.topics.
    Quotes/commas delimit so "Java" never matches "JavaScript" and "ci" never matches "cirrus"."""
    frags, args = [], []
    if languages:
        ors = " OR ".join(["r.languages LIKE '%\"'||?||'\"%'"] * len(languages))
        frags.append(f"({ors})"); args += languages
    if libraries:
        ors = " OR ".join(["(','||COALESCE(r.topics,'')||',') LIKE '%,'||?||',%'"] * len(libraries))
        frags.append(f"({ors})"); args += libraries
    return frags, args


def _commit_where(providers: list[str] | None, repo_ids: list[int] | None,
                  authors: list[str] | None, start: str | None, end: str | None,
                  languages: list[str] | None = None, libraries: list[str] | None = None,
                  ai_agents: list[str] | None = None) -> tuple[str, list]:
    """WHERE fragment (+args) over `commits c JOIN repos r`. Multi-select + date range +
    language/library (repo-level) + AI agent (commit-level).
    Dates match the commit's local day (substr of the offset-carrying timestamp)."""
    where, args = ["c.committed_at IS NOT NULL"], []
    if providers:
        where.append(f"r.provider IN ({','.join('?' * len(providers))})"); args += providers
    if repo_ids:
        where.append(f"r.id IN ({','.join('?' * len(repo_ids))})"); args += repo_ids
    if authors:
        where.append(f"c.author IN ({','.join('?' * len(authors))})"); args += authors
    if ai_agents:
        where.append(f"c.ai_agent IN ({','.join('?' * len(ai_agents))})"); args += ai_agents
    rfrags, rargs = _repo_match_sql(languages, libraries)
    where += rfrags; args += rargs
    if start:
        where.append("substr(c.committed_at,1,10) >= ?"); args.append(start)
    if end:
        where.append("substr(c.committed_at,1,10) <= ?"); args.append(end)
    return " AND ".join(where), args


def longest_streak(days: list[str]) -> int:
    """Longest run of consecutive calendar days present in `days` (YYYY-MM-DD)."""
    ds = sorted({date.fromisoformat(d) for d in days})
    best = cur = 0
    prev: date | None = None
    for d in ds:
        cur = cur + 1 if prev and (d - prev).days == 1 else 1
        best = max(best, cur)
        prev = d
    return best


def _fact(row) -> dict | None:
    return dict(row) if row else None


def stats(providers: list[str] | None = None, repo_ids: list[int] | None = None,
          authors: list[str] | None = None, start: str | None = None, end: str | None = None,
          languages: list[str] | None = None, libraries: list[str] | None = None,
          ai_agents: list[str] | None = None) -> dict:
    """Everything the Stats dashboard needs, honoring multi-select + date-range filters:
    KPI totals, timeline, top repos, author cloud, PR states, activity-by-hour/weekday,
    longest streak, language mix, AI-vs-human attribution, a repo Pulse (PRs/issues), and
    the fun deep-dive facts (longest commit, oldest commit/PR = "far, far away", dormant-repo
    graveyard = R.I.P, and co-author "code besties")."""
    conn = db.connect()
    cw, args = _commit_where(providers, repo_ids, authors, start, end, languages, libraries, ai_agents)
    j = "FROM commits c JOIN repos r ON c.repo_id=r.id WHERE " + cw

    monthly = {r["m"]: r["n"] for r in conn.execute(
        f"SELECT substr(c.committed_at,1,7) m, COUNT(*) n {j} GROUP BY m ORDER BY m", args)}
    top_repos = [{"name": r["full_name"], "value": r["n"], "id": r["id"]} for r in conn.execute(
        f"SELECT r.full_name, r.id, COUNT(*) n {j} GROUP BY r.id ORDER BY n DESC LIMIT 15", args)]
    author_rows = conn.execute(
        f"SELECT c.author, COUNT(*) n {j} AND c.author IS NOT NULL GROUP BY c.author ORDER BY n DESC LIMIT 80",
        args).fetchall()
    authors_out = [{"name": r["author"], "value": r["n"]} for r in author_rows]

    # Row-level pass over timestamps: hour/weekday histograms, daily buckets, streak, busiest day.
    # One column, timezone-consistent with the heatmap (local day/hour via fromisoformat).
    by_hour = [0] * 24
    by_weekday = [0] * 7  # Mon..Sun (datetime.weekday())
    daily: Counter[str] = Counter()
    for row in conn.execute(f"SELECT c.committed_at t {j}", args):
        try:
            dt = datetime.fromisoformat(row["t"])
        except (ValueError, TypeError):
            continue
        by_hour[dt.hour] += 1
        by_weekday[dt.weekday()] += 1
        daily[dt.date().isoformat()] += 1

    total = sum(daily.values())
    busiest = max(daily.items(), key=lambda kv: kv[1]) if daily else None
    streak = longest_streak(list(daily)) if daily else 0
    night_owl = max(range(24), key=lambda h: by_hour[h]) if total else 0

    # --- Fun deep-dive facts -------------------------------------------------
    longest = _fact(conn.execute(
        f"SELECT c.message, c.author, c.sha, c.url, c.committed_at, r.full_name repo, LENGTH(c.message) len "
        f"{j} AND c.message IS NOT NULL AND TRIM(c.message)!='' ORDER BY len DESC LIMIT 1", args).fetchone())
    far_commit = _fact(conn.execute(
        f"SELECT c.message, c.author, c.sha, c.url, c.committed_at, r.full_name repo "
        f"{j} ORDER BY c.committed_at ASC LIMIT 1", args).fetchone())

    # R.I.P graveyard: repos gone quietest the longest (oldest last-commit first).
    graveyard = [{"repo": r["full_name"], "id": r["id"], "last": r["last"], "commits": r["n"]}
                 for r in conn.execute(
        f"SELECT r.full_name, r.id, MAX(c.committed_at) last, COUNT(*) n {j} "
        "GROUP BY r.id ORDER BY last ASC LIMIT 6", args)]

    # Code besties: authors who most often share a repo (co-authorship proxy — metadata only).
    repo_authors: dict[int, set[str]] = defaultdict(set)
    for r in conn.execute(f"SELECT DISTINCT r.id rid, c.author a {j} AND c.author IS NOT NULL", args):
        repo_authors[r["rid"]].add(r["a"])
    pair_counts: Counter[tuple[str, str]] = Counter()
    for members in repo_authors.values():
        for a, b in combinations(sorted(members), 2):
            pair_counts[(a, b)] += 1
    besties = [{"a": a, "b": b, "shared": n} for (a, b), n in pair_counts.most_common(5)]

    n_authors = conn.execute(
        f"SELECT COUNT(DISTINCT c.author) n {j} AND c.author IS NOT NULL", args).fetchone()["n"]
    n_repos = conn.execute(f"SELECT COUNT(DISTINCT r.id) n {j}", args).fetchone()["n"]

    # PRs: provider/repo + created_at date range (no author dimension on PRs).
    pw, pa = ["1=1"], []
    if providers:
        pw.append(f"r.provider IN ({','.join('?' * len(providers))})"); pa += providers
    if repo_ids:
        pw.append(f"r.id IN ({','.join('?' * len(repo_ids))})"); pa += repo_ids
    _pf, _pa = _repo_match_sql(languages, libraries)
    pw += _pf; pa += _pa
    if start:
        pw.append("(p.created_at IS NULL OR substr(p.created_at,1,10) >= ?)"); pa.append(start)
    if end:
        pw.append("(p.created_at IS NULL OR substr(p.created_at,1,10) <= ?)"); pa.append(end)
    pj = "FROM pull_requests p JOIN repos r ON p.repo_id=r.id WHERE " + " AND ".join(pw)
    pr_states = [{"name": r["state"] or "unknown", "value": r["n"]} for r in conn.execute(
        f"SELECT p.state, COUNT(*) n {pj} GROUP BY p.state", pa)]
    n_prs = sum(x["value"] for x in pr_states)
    far_pr = _fact(conn.execute(
        f"SELECT p.number, p.title, p.state, p.author, p.created_at, r.full_name repo "
        f"{pj} AND p.created_at IS NOT NULL ORDER BY p.created_at ASC LIMIT 1", pa).fetchone())

    # Repo-level summary stats (stars/forks/releases/… + tags), over the same repo scope.
    # These don't depend on author/date — only on which repos are in view.
    # Qualify every column with r.* — tag_cloud JOINs tags, so a bare `id` would be ambiguous.
    rw, ra = ["1=1"], []
    if providers:
        rw.append(f"r.provider IN ({','.join('?' * len(providers))})"); ra += providers
    if repo_ids:
        rw.append(f"r.id IN ({','.join('?' * len(repo_ids))})"); ra += repo_ids
    _rf, _ra = _repo_match_sql(languages, libraries)
    rw += _rf; ra += _ra
    rwhere = " AND ".join(rw)
    row = conn.execute(
        f"""SELECT COALESCE(SUM(r.stars),0) stars, COALESCE(SUM(r.forks),0) forks,
                   COALESCE(SUM(r.watchers),0) watchers, COALESCE(SUM(r.open_issues),0) open_issues,
                   COALESCE(SUM(r.releases),0) releases, COALESCE(SUM(r.contributors),0) contributors,
                   COALESCE(SUM(r.downloads),0) downloads, COALESCE(SUM(r.builds),0) builds,
                   COALESCE(SUM(r.docker_pulls),0) docker_pulls, COALESCE(SUM(r.npm_downloads),0) npm_downloads
            FROM repos r WHERE {rwhere}""", ra).fetchone()
    repo_stats = dict(row)
    top_starred = [{"name": r["full_name"], "value": r["stars"], "id": r["id"]} for r in conn.execute(
        f"SELECT r.id, r.full_name, r.stars FROM repos r WHERE {rwhere} AND r.stars>0 ORDER BY r.stars DESC LIMIT 12", ra)]
    tag_cloud = [{"name": r["name"], "value": r["n"]} for r in conn.execute(
        f"SELECT t.name, COUNT(*) n FROM tags t JOIN repos r ON t.repo_id=r.id WHERE {rwhere} "
        "GROUP BY t.name ORDER BY n DESC LIMIT 100", ra)]

    # Language mix (GitHub-style % bar): sum bytes per language over the repos in scope.
    lang_bytes: Counter[str] = Counter()
    for r in conn.execute(f"SELECT r.languages FROM repos r WHERE {rwhere}", ra):
        if not r["languages"]:
            continue
        try:
            for k, v in json.loads(r["languages"]).items():
                if k:
                    lang_bytes[k] += int(v or 0)
        except (ValueError, TypeError):
            continue
    languages_out = [{"name": k, "value": v} for k, v in lang_bytes.most_common(12)]

    # AI vs human attribution over the commit scope (agent + role = committed/authored/co-authored).
    ai_agent_c, ai_role_c, ai_total = Counter(), Counter(), 0
    for r in conn.execute(f"SELECT c.ai_agent a, c.ai_role role, COUNT(*) n {j} GROUP BY c.ai_agent, c.ai_role", args):
        if r["a"]:
            ai_agent_c[r["a"]] += r["n"]; ai_role_c[r["role"] or "authored"] += r["n"]; ai_total += r["n"]
    ai_out = {"by_agent": [{"name": k, "value": v} for k, v in ai_agent_c.most_common()],
              "by_role": [{"name": k, "value": v} for k, v in ai_role_c.most_common()],
              "human_vs_ai": [{"name": "AI", "value": ai_total},
                              {"name": "Human", "value": max(total - ai_total, 0)}]}

    # Pulse (GitHub-style Overview): merged/open PRs + open/closed issues (work items). Issues
    # aren't repo-linked, so they're scoped by provider only.
    def _pr_count(*names):
        s = set(names)
        return sum(x["value"] for x in pr_states if (x["name"] or "").lower() in s)
    iw, ia = ["1=1"], []
    if providers:
        iw.append(f"provider IN ({','.join('?' * len(providers))})"); ia += providers
    issue_rows = conn.execute(
        f"SELECT state, COUNT(*) n FROM work_items WHERE {' AND '.join(iw)} GROUP BY state", ia).fetchall()
    issues_closed = sum(r["n"] for r in issue_rows if r["state"] and _CLOSED_STATE.search(r["state"]))
    pulse = {"prs_merged": _pr_count("merged"), "prs_open": _pr_count("open", "opened", "active"),
             "prs_total": n_prs, "issues_open": sum(r["n"] for r in issue_rows) - issues_closed,
             "issues_closed": issues_closed}

    conn.close()
    return {
        "totals": {"commits": total, "repos": n_repos, "authors": n_authors,
                   "prs": n_prs, "active_days": len(daily), "streak": streak},
        "monthly": monthly, "top_repos": top_repos, "authors": authors_out, "pr_states": pr_states,
        "by_hour": by_hour, "by_weekday": by_weekday, "night_owl_hour": night_owl,
        "busiest_day": {"day": busiest[0], "count": busiest[1]} if busiest else None,
        "repo_stats": repo_stats, "top_starred": top_starred, "tags": tag_cloud,
        "languages": languages_out, "ai": ai_out, "pulse": pulse,
        "facts": {"longest_commit": longest, "far_away_commit": far_commit,
                  "far_away_pr": far_pr, "graveyard": graveyard, "besties": besties},
    }


# --------------------------------------------------------------------------- #
# Contributors: a network of people (avatar nodes) + GitHub-style per-person /
# per-repo detail. Identity = author_login when known, else the commit author name.
# --------------------------------------------------------------------------- #
_KEY = "COALESCE(c.author_login, c.author)"


def _contrib_adddel(conn, repo_ids: list[int]) -> dict:
    """{login: [additions, deletions]} summed from repos.contrib_stats over the given repos."""
    out: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    if not repo_ids:
        return out
    ph = ",".join("?" * len(repo_ids))
    for r in conn.execute(f"SELECT contrib_stats FROM repos WHERE id IN ({ph})", repo_ids):
        if not r["contrib_stats"]:
            continue
        try:
            for login, st in json.loads(r["contrib_stats"]).items():
                out[login][0] += st.get("additions", 0)
                out[login][1] += st.get("deletions", 0)
        except (ValueError, TypeError):
            continue
    return out


def _contrib_list(conn, cw: str, args: list, cap: int = 200) -> list[dict]:
    """Ranked contributors over a commit WHERE-fragment: commits, repos, avatar, +/-."""
    j = f"FROM commits c JOIN repos r ON c.repo_id=r.id WHERE {cw} AND {_KEY} IS NOT NULL"
    rows = conn.execute(
        f"SELECT {_KEY} k, MAX(c.author) name, MAX(c.author_avatar) avatar, "
        f"COUNT(*) commits, COUNT(DISTINCT c.repo_id) repos {j} GROUP BY k ORDER BY commits DESC LIMIT ?",
        (*args, cap)).fetchall()
    scoped = [r["rid"] for r in conn.execute(f"SELECT DISTINCT c.repo_id rid {j}", args)]
    ad = _contrib_adddel(conn, scoped)
    return [{"login": r["k"], "name": r["name"], "avatar": r["avatar"], "commits": r["commits"],
             "repos": r["repos"], "additions": ad.get(r["k"], [0, 0])[0],
             "deletions": ad.get(r["k"], [0, 0])[1]} for r in rows]


def contributors(providers=None, repo_ids=None, start=None, end=None,
                 languages=None, libraries=None, ai_agents=None,
                 node_cap: int = 60, list_cap: int = 200) -> dict:
    """Avatar-node network: nodes = contributors, edges = sharing a repo (collab)."""
    conn = db.connect()
    cw, args = _commit_where(providers, repo_ids, None, start, end, languages, libraries, ai_agents)
    lst = _contrib_list(conn, cw, args, cap=list_cap)
    top = lst[:node_cap]
    top_set = {d["login"] for d in top}
    # Collaboration edges: two top contributors who both committed to the same repo.
    j = f"FROM commits c JOIN repos r ON c.repo_id=r.id WHERE {cw} AND {_KEY} IS NOT NULL"
    repo_members: dict[int, set] = defaultdict(set)
    for r in conn.execute(f"SELECT DISTINCT c.repo_id rid, {_KEY} k {j}", args):
        if r["k"] in top_set:
            repo_members[r["rid"]].add(r["k"])
    pair: Counter = Counter()
    for members in repo_members.values():
        for a, b in combinations(sorted(members), 2):
            pair[(a, b)] += 1
    nodes = []
    for i, d in enumerate(top):
        angle = i * 2.399963
        rad = math.sqrt(i + 1)
        nodes.append({"key": d["login"], "attributes": {
            "label": d["name"] or d["login"], "image": d["avatar"], "avatar": d["avatar"],
            "commits": d["commits"], "size": 6 + math.log1p(d["commits"]) * 3,
            "x": rad * math.cos(angle), "y": rad * math.sin(angle), "color": "#58a6ff"}})
    edges = [{"key": f"{a}|{b}", "source": a, "target": b, "weight": n} for (a, b), n in pair.most_common(600)]
    conn.close()
    return {"nodes": nodes, "edges": edges, "list": lst}


def contributor_detail(login: str | None = None, repo_id: int | None = None, providers=None,
                       repo_ids=None, start=None, end=None, languages=None, libraries=None, ai_agents=None) -> dict:
    """GitHub-style detail for a focused contributor (login) or repo (repo_id): weekly
    commits-over-time, ranked contributor cards w/ per-card weekly sparkline, top repos,
    language mix, and a Pulse overview."""
    conn = db.connect()
    rids = [repo_id] if repo_id else repo_ids
    cw, args = _commit_where(providers, rids, None, start, end, languages, libraries, ai_agents)
    j = f"FROM commits c JOIN repos r ON c.repo_id=r.id WHERE {cw} AND {_KEY} IS NOT NULL"

    # Weekly buckets per contributor (one pass) — %Y-%W is Monday-based week, fine for sparklines.
    per: dict[str, dict] = defaultdict(dict)
    for r in conn.execute(
            f"SELECT {_KEY} k, strftime('%Y-%W', substr(c.committed_at,1,10)) w, COUNT(*) n {j} "
            "GROUP BY k, w", args):
        if r["w"]:
            per[r["k"]][r["w"]] = r["n"]
    weeks = sorted({w for m in per.values() for w in m})

    def series(k):
        return [{"week": w, "commits": per[k].get(w, 0)} for w in weeks]

    clist = _contrib_list(conn, cw, args, cap=60)
    for d in clist:
        d["weekly"] = series(d["login"])
    rank_of = {d["login"]: i + 1 for i, d in enumerate(clist)}

    # Focus = a single contributor (login) or the whole (repo-scoped) set.
    focus = next((d for d in clist if d["login"] == login), None) if login else None
    if login:
        agg = per.get(login, {})
        weekly = [{"week": w, "commits": agg.get(w, 0)} for w in weeks]
        fcw = cw + f" AND {_KEY}=?"; fargs = [*args, login]
    else:
        total = Counter()
        for m in per.values():
            for w, n in m.items():
                total[w] += n
        weekly = [{"week": w, "commits": total.get(w, 0)} for w in weeks]
        fcw, fargs = cw, list(args)
    fj = f"FROM commits c JOIN repos r ON c.repo_id=r.id WHERE {fcw}"

    top_repos = [{"name": r["full_name"], "value": r["n"], "id": r["id"]} for r in conn.execute(
        f"SELECT r.full_name, r.id, COUNT(*) n {fj} GROUP BY r.id ORDER BY n DESC LIMIT 10", fargs)]
    scoped = [r["rid"] for r in conn.execute(f"SELECT DISTINCT c.repo_id rid {fj}", fargs)]
    lang_bytes: Counter = Counter()
    if scoped:
        ph = ",".join("?" * len(scoped))
        for r in conn.execute(f"SELECT languages FROM repos WHERE id IN ({ph})", scoped):
            if r["languages"]:
                try:
                    for k, v in json.loads(r["languages"]).items():
                        if k:
                            lang_bytes[k] += int(v or 0)
                except (ValueError, TypeError):
                    continue
    languages_out = [{"name": k, "value": v} for k, v in lang_bytes.most_common(8)]

    # Pulse: PRs (by author when a contributor is focused) + issues over the repo scope.
    pw, pa = ["1=1"], []
    if scoped:
        pw.append(f"r.id IN ({','.join('?' * len(scoped))})"); pa += scoped
    else:
        pw.append("0")
    if focus:
        pw.append("(p.author=? OR p.author=?)"); pa += [login, focus.get("name") or login]
    pj = "FROM pull_requests p JOIN repos r ON p.repo_id=r.id WHERE " + " AND ".join(pw)
    pr_rows = conn.execute(f"SELECT p.state, COUNT(*) n {pj} GROUP BY p.state", pa).fetchall()
    def _pc(*names):
        s = set(names); return sum(r["n"] for r in pr_rows if (r["state"] or "").lower() in s)
    pulse = {"prs_merged": _pc("merged"), "prs_open": _pc("open", "opened", "active"),
             "prs_total": sum(r["n"] for r in pr_rows), "issues_open": 0, "issues_closed": 0}

    conn.close()
    return {
        "login": login, "name": focus["name"] if focus else (login or None),
        "avatar": focus["avatar"] if focus else None, "rank": rank_of.get(login, 0) if login else 0,
        "commits": focus["commits"] if focus else sum(d["commits"] for d in clist),
        "additions": focus["additions"] if focus else sum(d["additions"] for d in clist),
        "deletions": focus["deletions"] if focus else sum(d["deletions"] for d in clist),
        "weekly": weekly, "top_repos": top_repos, "languages": languages_out,
        "pulse": pulse, "contributors": clist,
    }


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
