"""Relate Jira issues to git commits / PRs / branches so a separate Jira account bridges
into the network graph. Two signals, best-first:

  1. issue-key (exact): a Jira key like ABC-123 in a commit message, PR title, or branch
     name — the reliable, industry-standard link (Jira Smart Commits / dev panel). Only keys
     whose prefix is a real Jira project AND whose full key is a known issue count, so
     "UTF-8" / "COVID-19" never false-match.
  2. title (fuzzy): Jaccard overlap of normalized word sets between the issue summary and a
     PR title / branch name — catches links a human made without ever typing the key.

Links are stored as (work_item_id, node_kind, node_id) where node_kind is pr|branch|repo and
node_id is that entity's id — exactly the node keys graph.py emits, so the graph just draws
wi:<id> -> <kind>:<node_id>.

# ponytail: rebuild is a full re-scan (O(jira x (PRs + branches)) for the fuzzy pass). Fine for
# thousands of issues x hundreds of PRs; add per-project blocking / an index if it ever hurts.
"""
from __future__ import annotations

import re

from . import db

FUZZY_MIN = 0.6  # Jaccard threshold; ponytail: tune if fuzzy links look too loose/tight.
_STOP = {"the", "a", "an", "to", "of", "for", "and", "or", "in", "on", "with", "fix", "fixes",
         "fixed", "bug", "issue", "add", "adds", "update", "updates", "feature", "wip", "test",
         "merge", "branch", "pull", "request", "new", "create", "support"}


def _tokens(s: str | None) -> set[str]:
    return {w for w in re.split(r"[^a-z0-9]+", (s or "").lower()) if len(w) > 2 and w not in _STOP}


def _jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def rebuild_links(conn=None) -> int:
    """Recompute all Jira issue -> git links. Returns the number of links written."""
    own = conn is None
    conn = conn or db.connect()
    try:
        conn.execute("DELETE FROM work_item_links")
        jira = conn.execute(
            "SELECT id, external_id, title FROM work_items WHERE provider='jira'").fetchall()
        if not jira:
            conn.commit()
            return 0

        key_to_wi = {w["external_id"].upper(): w["id"] for w in jira}
        known_keys = set(key_to_wi)
        projects = {k.split("-", 1)[0] for k in known_keys}
        key_re = re.compile(r"\b(?:" + "|".join(re.escape(p) for p in projects) + r")-\d+\b", re.I)

        def keys_in(text: str | None) -> set[str]:
            # only keys that are actually known issues (kills UTF-8 / COVID-19 false positives)
            return {m.group(0).upper() for m in key_re.finditer(text or "")} & known_keys

        links: set[tuple[int, str, int, str]] = set()  # (wi_id, kind, node_id, method) — deduped

        # --- exact issue-key pass ---
        for pr in conn.execute("SELECT id, title, source_branch FROM pull_requests"):
            for k in keys_in(f"{pr['title']} {pr['source_branch']}"):
                links.add((key_to_wi[k], "pr", pr["id"], "key"))
        for br in conn.execute("SELECT id, name FROM branches"):
            for k in keys_in(br["name"]):
                links.add((key_to_wi[k], "branch", br["id"], "key"))
        for cm in conn.execute("SELECT repo_id, message FROM commits WHERE message IS NOT NULL"):
            for k in keys_in(cm["message"]):
                links.add((key_to_wi[k], "repo", cm["repo_id"], "key"))  # commits are aggregated -> repo node

        # --- fuzzy title pass (only where an exact key link doesn't already exist) ---
        keyed = {(w, k, n) for (w, k, n, _m) in links}
        wi_tokens = [(w["id"], _tokens(w["title"])) for w in jira]
        prs = [(p["id"], _tokens(p["title"])) for p in conn.execute("SELECT id, title FROM pull_requests")]
        brs = [(b["id"], _tokens(b["name"].replace("-", " ").replace("/", " ").replace("_", " ")))
               for b in conn.execute("SELECT id, name FROM branches")]
        for wid, wt in wi_tokens:
            if not wt:
                continue
            for pid, pt in prs:
                if (wid, "pr", pid) not in keyed and _jaccard(wt, pt) >= FUZZY_MIN:
                    links.add((wid, "pr", pid, "fuzzy"))
            for bid, bt in brs:
                if (wid, "branch", bid) not in keyed and _jaccard(wt, bt) >= FUZZY_MIN:
                    links.add((wid, "branch", bid, "fuzzy"))

        conn.executemany(
            "INSERT INTO work_item_links(work_item_id, node_kind, node_id, method) VALUES(?,?,?,?)",
            list(links))
        conn.commit()
        return len(links)
    finally:
        if own:
            conn.close()


def _demo() -> None:
    """Self-check: exact key beats fuzzy, and false-positive keys are rejected."""
    import sqlite3
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(db.SCHEMA)
    c.execute("INSERT INTO accounts(id,provider,username,owner_url,token_ref,created_at) "
              "VALUES(1,'jira','me@x.com','https://x.atlassian.net','r','t')")
    c.execute("INSERT INTO accounts(id,provider,username,owner_url,token_ref,created_at) "
              "VALUES(2,'github','me','https://github.com/me','r2','t')")
    c.execute("INSERT INTO repos(id,account_id,provider,full_name,url) VALUES(10,2,'github','me/app','u')")
    # Jira issues
    c.execute("INSERT INTO work_items(id,account_id,provider,external_id,project,title) "
              "VALUES(100,1,'jira','ABC-123','ABC','Add login rate limiter')")
    c.execute("INSERT INTO work_items(id,account_id,provider,external_id,project,title) "
              "VALUES(101,1,'jira','ABC-9','ABC','Refactor payment webhook handler')")
    # git artifacts
    c.execute("INSERT INTO pull_requests(id,repo_id,number,title,source_branch) "
              "VALUES(200,10,1,'ABC-123 add limiter','feat/limit')")           # exact key -> 100
    c.execute("INSERT INTO branches(id,repo_id,name) VALUES(300,10,'feature/payment-webhook-handler')")  # fuzzy -> 101
    c.execute("INSERT INTO commits(sha,repo_id,message) VALUES('deadbeef',10,'Bumped to UTF-8 encoding')")  # NOT a key
    c.commit()

    n = rebuild_links(c)
    rows = {(r["work_item_id"], r["node_kind"], r["node_id"], r["method"])
            for r in c.execute("SELECT * FROM work_item_links")}
    assert (100, "pr", 200, "key") in rows, rows                      # exact key link
    assert any(r[:3] == (101, "branch", 300) for r in rows), rows     # fuzzy title link
    assert not any(k == "repo" for (_w, k, _n, _m) in rows), rows     # UTF-8 must NOT link a commit
    assert (100, "pr", 200, "fuzzy") not in rows                      # keyed pair not re-added as fuzzy
    print(f"match._demo OK — {n} links:", sorted(rows))


if __name__ == "__main__":
    _demo()
