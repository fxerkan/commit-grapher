"""Attribute a commit to an AI coding agent from *metadata only* — the commit message
trailers/signature and the author/committer identity. No file contents are read.

Roles distinguish the three cases the user cares about:
- "committed"  — the recorded author/committer *is* the agent (a bot pushed the commit)
- "co-authored"— a human committed, an agent is a `Co-authored-by:` trailer (AI helped)
- "authored"   — the message advertises the agent wrote it ("Generated with …")

# ponytail: identity/trailer heuristics over commit metadata. "reviewed" (AI PR review)
# needs the PR-reviews API we don't crawl yet — documented follow-up, not here.
"""
from __future__ import annotations

import re

# (label, matcher). Order matters: more specific agents before generic fallbacks.
AGENTS: list[tuple[str, re.Pattern]] = [
    ("Claude Code", re.compile(r"claude\s*code|claude\.(?:ai|com)/code|anthropic", re.I)),
    ("GitHub Copilot", re.compile(r"copilot", re.I)),
    ("OpenAI Codex", re.compile(r"\bcodex\b|openai", re.I)),
    ("Cursor", re.compile(r"\bcursor\b", re.I)),
    ("Gemini", re.compile(r"\bgemini\b", re.I)),
    ("Devin", re.compile(r"\bdevin\b", re.I)),
    ("Dependabot", re.compile(r"dependabot", re.I)),
    ("Renovate", re.compile(r"renovate", re.I)),
    ("GitHub Actions", re.compile(r"github-actions", re.I)),
    ("Claude", re.compile(r"\bclaude\b", re.I)),
]
_CO = re.compile(r"co-authored-by", re.I)


def classify(message: str | None, author_name: str | None = None, author_email: str | None = None,
             committer_name: str | None = None, committer_email: str | None = None) -> tuple[str | None, str | None]:
    """-> (agent, role) or (None, None) for a plain human commit."""
    identity = " ".join(x for x in (author_name, author_email, committer_name, committer_email) if x)
    msg = message or ""
    # 1) The author/committer identity itself is an agent -> the agent committed.
    for label, rx in AGENTS:
        if rx.search(identity):
            return label, "committed"
    # 2) A Co-authored-by trailer names an agent -> human committed, agent co-authored.
    co = "\n".join(ln for ln in msg.splitlines() if _CO.search(ln))
    if co:
        for label, rx in AGENTS:
            if rx.search(co):
                return label, "co-authored"
    # 3) The message advertises the agent (e.g. "🤖 Generated with Claude Code") -> authored.
    for label, rx in AGENTS:
        if rx.search(msg):
            return label, "authored"
    return None, None


if __name__ == "__main__":
    assert classify("fix bug", "Jane Dev", "jane@x.com") == (None, None)
    assert classify("bump deps", "dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com") == ("Dependabot", "committed")
    assert classify(
        "add feature\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\n"
        "Co-Authored-By: Claude <noreply@anthropic.com>", "Jane Dev", "jane@x.com"
    ) == ("Claude Code", "co-authored")
    assert classify("refactor\n\nCo-authored-by: Copilot <copilot@github.com>", "Jane", "j@x.com") == ("GitHub Copilot", "co-authored")
    assert classify("wrote this with Cursor", "Jane", "j@x.com") == ("Cursor", "authored")
    assert classify("normal commit\n\nCo-authored-by: Bob <bob@x.com>", "Jane", "j@x.com") == (None, None)
    print("ai.classify: ok")
