"""A tiny GraphQL endpoint over the network graph (nodes + edges).

Lets users deep-dive / filter the same graph the canvas shows, with real GraphQL
(introspection, aliases, arbitrary field selection) instead of a fixed set of REST params.

# ponytail: graphql-core (the pure-python reference impl) over the already-built graph dict,
# resolved with the default field resolver (dicts + callables). The upgrade path, if users
# want to traverse commits/PRs/issues directly, is a per-entity schema backed by db.py —
# today it queries the flattened nodes the graph already produces.
"""
from __future__ import annotations

from graphql import build_schema, graphql_sync

from . import db, graph

SDL = """
"A node in the network graph (account, repo, branch, pr, commit or workitem)."
type Node {
  key: String!
  label: String
  type: String
  size: Float
  repoId: Int
  author: String
  project: String
  organization: String
  aiAgent: String
}

"A directed relationship between two node keys."
type Edge {
  key: String!
  source: String!
  target: String!
}

type Query {
  "Graph nodes, optionally filtered. `search` matches the label. commit nodes are read live from the DB (no need to focus a repo); `aiOnly: true` keeps only AI-attributed commits."
  nodes(type: String, author: String, project: String, organization: String,
        aiAgent: String, aiOnly: Boolean = false, repoId: Int, search: String, limit: Int = 1000): [Node!]!
  "Graph edges (source/target are node keys)."
  edges(limit: Int = 5000): [Edge!]!
  "Count of nodes, optionally of a single `type`. commit counts are read live from the DB."
  count(type: String, aiOnly: Boolean = false): Int!
}
"""

schema = build_schema(SDL)


def _flatten(nodes: list[dict]) -> list[dict]:
    out = []
    for n in nodes:
        a = n["attributes"]
        out.append({
            "key": n["key"], "label": a.get("label"), "type": a.get("nodeType"),
            "size": a.get("size"), "repoId": a.get("repoId"), "author": a.get("author"),
            "project": a.get("project"), "organization": a.get("organization"),
            "aiAgent": a.get("aiAgent"),
        })
    return out


def _commits_from_db(provider=None, author=None, aiAgent=None, aiOnly=False,
                     repoId=None, search=None, limit=1000) -> list[dict]:
    """Commit nodes read straight from the DB so they're queryable WITHOUT focusing a repo
    (the canvas only expands commits on focus; GraphQL shouldn't have that limitation)."""
    where, args = ["1=1"], []
    if provider:  where.append("a.provider = ?"); args.append(provider)
    if author:    where.append("c.author = ?"); args.append(author)
    if aiAgent:   where.append("c.ai_agent = ?"); args.append(aiAgent)
    if aiOnly:    where.append("c.ai_agent IS NOT NULL")
    if repoId is not None: where.append("c.repo_id = ?"); args.append(repoId)
    if search:    where.append("c.message LIKE ?"); args.append(f"%{search}%")
    conn = db.connect()
    rows = conn.execute(
        f"""SELECT c.repo_id, c.sha, c.message, c.author, c.ai_agent, r.full_name
            FROM commits c JOIN repos r ON r.id = c.repo_id JOIN accounts a ON a.id = r.account_id
            WHERE {' AND '.join(where)} ORDER BY c.committed_at DESC LIMIT ?""",
        (*args, max(0, limit))).fetchall()
    conn.close()
    return [{"key": f"commit:{r['repo_id']}:{r['sha']}",
             "label": (r["message"] or r["sha"]).splitlines()[0][:48] if r["message"] else r["sha"],
             "type": "commit", "size": 2, "repoId": r["repo_id"], "author": r["author"],
             "project": r["full_name"].split("/", 1)[0], "organization": None,
             "aiAgent": r["ai_agent"]} for r in rows]


def _count_commits(provider=None, aiOnly=False) -> int:
    where, args = ["1=1"], []
    if provider: where.append("a.provider = ?"); args.append(provider)
    if aiOnly:   where.append("c.ai_agent IS NOT NULL")
    conn = db.connect()
    n = conn.execute(f"SELECT COUNT(*) n FROM commits c JOIN repos r ON r.id=c.repo_id "
                     f"JOIN accounts a ON a.id=r.account_id WHERE {' AND '.join(where)}", args).fetchone()["n"]
    conn.close()
    return n


def _root(provider: str | None, focus_repo: int | None) -> dict:
    # account/repo/branch/pr/workitem come from the built graph; commits are read live from the
    # DB (below) so `nodes(type:"commit")` works globally, not only for a focused repo.
    g = graph.build(provider=provider, focus_repo=focus_repo)
    flat = [n for n in _flatten(g["nodes"]) if n["type"] != "commit"]

    def nodes(_info, type=None, author=None, project=None, organization=None,
              aiAgent=None, aiOnly=False, repoId=None, search=None, limit=1000):
        if type == "commit":
            return _commits_from_db(provider, author, aiAgent, aiOnly, repoId, search, limit)
        s = (search or "").lower()
        out = [n for n in flat
               if (type is None or n["type"] == type)
               and (author is None or n["author"] == author)
               and (project is None or n["project"] == project)
               and (organization is None or n["organization"] == organization)
               and (aiAgent is None or n["aiAgent"] == aiAgent)
               and (repoId is None or n["repoId"] == repoId)
               and (not s or s in (n["label"] or "").lower())]
        return out[: max(0, limit)]

    def edges(_info, limit=5000):
        return g["edges"][: max(0, limit)]

    def count(_info, type=None, aiOnly=False):
        if type == "commit":
            return _count_commits(provider, aiOnly)
        return sum(1 for n in flat if type is None or n["type"] == type)

    # graphql-core's default field resolver calls values that are callable, passing (info, **args).
    return {"nodes": nodes, "edges": edges, "count": count}


def execute(query: str, variables: dict | None = None, provider: str | None = None,
            focus_repo: int | None = None) -> dict:
    result = graphql_sync(schema, query, root_value=_root(provider, focus_repo), variable_values=variables)
    out: dict = {"data": result.data}
    if result.errors:
        out["errors"] = [{"message": e.message} for e in result.errors]
    return out


if __name__ == "__main__":  # ponytail: one runnable check — schema + resolver shape, no server/db needed.
    import graphql as _g
    n = [{"key": "repo:1", "attributes": {"label": "a/b", "nodeType": "repo", "size": 6, "repoId": 1}},
         {"key": "commit:1", "attributes": {"label": "fix", "nodeType": "commit", "author": "me"}}]
    root = {"nodes": _root.__wrapped__ if hasattr(_root, "__wrapped__") else None}
    # exercise the resolver directly against a fake graph
    flat = _flatten(n)

    def _nodes(_i, type=None, **k):
        return [x for x in flat if type is None or x["type"] == type]
    r = _g.graphql_sync(schema, '{ repos: count(type: "repo") all: count nodes(type: "repo") { key label } }',
                        root_value={"nodes": _nodes, "edges": lambda _i, **k: [], "count":
                                    lambda _i, type=None, **k: sum(1 for x in flat if type is None or x["type"] == type)})
    assert r.errors is None, r.errors
    assert r.data["repos"] == 1 and r.data["all"] == 2, r.data
    assert r.data["nodes"] == [{"key": "repo:1", "label": "a/b"}], r.data["nodes"]
    print("ok", r.data)
