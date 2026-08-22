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
