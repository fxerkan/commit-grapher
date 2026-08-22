"""Runnable self-check: `python -m app.test_charts` (no framework).

Covers the non-trivial logic: timezone-aware daily bucketing and graph node/edge
counts from a fixture DB.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

from . import charts, db, graph


def test_bucket_by_day_timezone_edge():
    # A commit at 23:30+02:00 is 21:30 UTC — but must count on its LOCAL day (the 5th),
    # not roll back to the 4th. And a +14:00 morning stays on its own day.
    rows = [
        "2026-01-05T23:30:00+02:00",
        "2026-01-05T00:30:00+02:00",  # same local day
        "2026-01-06T01:00:00+14:00",  # different local day
        "",                            # ignored
        "not-a-date",                 # ignored
        None,                          # ignored
    ]
    got = charts.bucket_by_day(rows)
    assert got == {"2026-01-05": 2, "2026-01-06": 1}, got


def test_longest_streak():
    assert charts.longest_streak([]) == 0
    assert charts.longest_streak(["2026-01-01"]) == 1
    # a 3-day run (2,3,4), a gap, then a 2-day run -> best is 3
    days = ["2026-01-02", "2026-01-03", "2026-01-04", "2026-01-08", "2026-01-09"]
    assert charts.longest_streak(days) == 3, days


def test_stats_facts_from_fixture():
    with tempfile.TemporaryDirectory() as tmp:
        db.DB_PATH = Path(tmp) / "t.db"
        db.init()
        conn = db.connect()
        conn.execute("INSERT INTO accounts(id,provider,username,owner_url,token_ref,created_at)"
                     " VALUES(1,'github','octo','u','r','2026-01-01')")
        conn.executemany(
            "INSERT INTO repos(id,account_id,provider,full_name,url,stars,forks,releases) VALUES(?,1,'github',?,'u',?,?,?)",
            [(1, "octo/alive", 10, 3, 2), (2, "octo/dead", 5, 1, 0)])
        conn.executemany("INSERT INTO tags(repo_id,name) VALUES(?,?)",
                         [(1, "v1.0"), (1, "v1.1"), (2, "v1.0")])
        conn.executemany(
            "INSERT INTO commits(sha,repo_id,author,message,committed_at) VALUES(?,?,?,?,?)",
            [("a", 1, "erkan", "short", "2026-08-20T02:00:00+00:00"),          # night owl 02:00
             ("b", 1, "peer", "a much much longer commit message", "2026-08-20T10:00:00+00:00"),
             ("c", 2, "erkan", "old one", "2019-01-01T09:00:00+00:00")])       # far, far away + graveyard
        conn.commit()
        conn.close()

        s = charts.stats()
        assert s["totals"]["commits"] == 3, s["totals"]
        assert s["night_owl_hour"] == 2, s["night_owl_hour"]
        assert s["facts"]["longest_commit"]["author"] == "peer", s["facts"]["longest_commit"]
        assert s["facts"]["far_away_commit"]["committed_at"].startswith("2019"), s["facts"]["far_away_commit"]
        # dead repo (oldest last-commit) leads the graveyard; erkan & peer share repo 1 -> besties
        assert s["facts"]["graveyard"][0]["repo"] == "octo/dead", s["facts"]["graveyard"]
        assert {s["facts"]["besties"][0]["a"], s["facts"]["besties"][0]["b"]} == {"erkan", "peer"}
        # date range narrows to 2026 only (drops the 2019 commit)
        assert charts.stats(start="2026-01-01")["totals"]["commits"] == 2
        # repo-level stats sum across scoped repos; tags cloud counts v1.0 twice
        assert s["repo_stats"]["stars"] == 15 and s["repo_stats"]["releases"] == 2, s["repo_stats"]
        assert s["top_starred"][0]["name"] == "octo/alive", s["top_starred"]
        assert {t["name"]: t["value"] for t in s["tags"]}["v1.0"] == 2, s["tags"]
        # repo-scoping the stats to repo 1 only
        s1 = charts.stats(repo_ids=[1])
        assert s1["repo_stats"]["stars"] == 10, s1["repo_stats"]


def test_graph_counts_from_fixture():
    with tempfile.TemporaryDirectory() as tmp:
        db.DB_PATH = Path(tmp) / "t.db"
        db.init()
        conn = db.connect()
        conn.execute(
            "INSERT INTO accounts(id,provider,username,owner_url,token_ref,created_at)"
            " VALUES(1,'github','octo','https://github.com/octo','github:octo','2026-01-01')"
        )
        conn.execute(
            "INSERT INTO repos(id,account_id,provider,full_name,url) "
            "VALUES(1,1,'github','octo/demo','https://github.com/octo/demo')"
        )
        conn.execute("INSERT INTO branches(id,repo_id,name) VALUES(1,1,'main'),(2,1,'dev')")
        conn.execute(
            "INSERT INTO pull_requests(id,repo_id,number,title,state,target_branch)"
            " VALUES(1,1,7,'Add x','open','main')"
        )
        conn.executemany(
            "INSERT INTO commits(sha,repo_id,branch_ref,committed_at) VALUES(?,?, 'main', ?)",
            [("a", 1, "2026-01-05T10:00:00+00:00"), ("b", 1, "2026-01-05T11:00:00+00:00")],
        )
        conn.commit()
        conn.close()

        g = graph.build()
        # nodes: 1 account + 1 repo + 2 branches + 1 pr = 5
        assert len(g["nodes"]) == 5, g["nodes"]
        # edges: acct->repo, repo->main, repo->dev, repo->pr, pr->main(target) = 5
        assert len(g["edges"]) == 5, [e["key"] for e in g["edges"]]
        # repo node size grows with commit count (>base 6)
        repo = next(n for n in g["nodes"] if n["key"] == "repo:1")
        assert repo["attributes"]["size"] > 6

        assert charts.heatmap() == {"2026-01-05": 2}


if __name__ == "__main__":
    test_bucket_by_day_timezone_edge()
    test_graph_counts_from_fixture()
    print("ok")
