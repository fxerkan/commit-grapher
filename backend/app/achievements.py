"""Best-effort scrape of a GitHub user's profile achievements (Pull Shark, Starstruck,
YOLO, Quickdraw, …). GitHub has no public achievements API, so we read the public,
server-rendered profile HTML. Reads a public *profile page*, never repo file contents.

# ponytail: HTML scrape — brittle to GitHub markup changes; returns [] on any change or
# failure (the crawler wraps it in safe()). Upgrade path: none public; revisit if GitHub
# ships an API.
"""
from __future__ import annotations

import re

import httpx

# Achievement badges render as an <a href="…?achievement=SLUG…"> wrapping an
# <img alt="Achievement: NAME" src="URL">. A default-tier bubble ("x2") sits nearby.
_ACH = re.compile(
    r'achievement=(?P<slug>[a-z0-9\-]+)[^>]*>\s*<img[^>]*alt="Achievement:\s*(?P<name>[^"]+)"[^>]*src="(?P<img>[^"]+)"',
    re.I | re.S)
_TIER = re.compile(r">\s*x(\d+)\s*<")


def parse(html: str) -> list[dict]:
    """Extract achievement badges from profile HTML. Pure — unit-testable without network."""
    out, seen = [], set()
    for m in _ACH.finditer(html):
        slug = m.group("slug").lower()
        if slug in seen:
            continue
        seen.add(slug)
        tm = _TIER.search(html[m.end():m.end() + 400])  # tier bubble follows the badge
        out.append({"slug": slug, "name": m.group("name").strip(),
                    "image_url": m.group("img"), "tier": int(tm.group(1)) if tm else 1})
    return out


def scrape(username: str) -> list[dict]:
    """Fetch a GitHub profile and return its achievement badges. [] on any failure."""
    if not username:
        return []
    r = httpx.get(f"https://github.com/{username}", timeout=20, follow_redirects=True,
                  headers={"User-Agent": "commit-grapher"})
    if r.status_code != 200:
        return []
    return parse(r.text)


if __name__ == "__main__":
    fixture = (
        '<a href="/octocat?achievement=pull-shark&tab=achievements">'
        '<img alt="Achievement: Pull Shark" src="https://x/ps.png" class="h-6"></a>'
        '<span class="tier">x3</span>'
        '<a href="/octocat?achievement=yolo&tab=achievements">'
        '<img alt="Achievement: YOLO" src="https://x/yolo.png"></a>'
    )
    got = parse(fixture)
    assert [g["slug"] for g in got] == ["pull-shark", "yolo"], got
    assert got[0]["tier"] == 3 and got[1]["tier"] == 1, got
    assert got[0]["name"] == "Pull Shark", got
    print("achievements.parse: ok")
