"""GitHub OAuth Device Flow — lets users log in without creating a PAT by hand.

Device flow needs only a public client_id (no client secret, no redirect server), so
it fits a local app. Register a GitHub OAuth App with "Enable Device Flow" checked and
pass its client_id. The resulting access token is a normal bearer token, so the existing
GitHubAdapter uses it unchanged.
"""
from __future__ import annotations

from datetime import datetime, timezone

import httpx

from . import config, db

SCOPE = "repo read:user"
_H = {"Accept": "application/json"}


def start(client_id: str) -> dict:
    r = httpx.post("https://github.com/login/device/code",
                   data={"client_id": client_id, "scope": SCOPE}, headers=_H, timeout=30)
    r.raise_for_status()
    d = r.json()
    if "device_code" not in d:
        raise RuntimeError(d.get("error_description") or "device code request failed")
    # verification_uri + user_code are what the user needs; device_code is the poll key.
    return {k: d[k] for k in ("device_code", "user_code", "verification_uri", "interval", "expires_in")}


def poll(client_id: str, device_code: str) -> dict:
    """One poll tick. Returns {status: 'pending'|'done', ...}."""
    r = httpx.post("https://github.com/login/oauth/access_token",
                   data={"client_id": client_id, "device_code": device_code,
                         "grant_type": "urn:ietf:params:oauth:grant-type:device_code"},
                   headers=_H, timeout=30)
    r.raise_for_status()
    d = r.json()
    if d.get("error") in ("authorization_pending", "slow_down"):
        return {"status": "pending", "error": d["error"]}
    token = d.get("access_token")
    if not token:
        raise RuntimeError(d.get("error_description") or d.get("error") or "no token")

    login = httpx.get("https://api.github.com/user",
                      headers={"Authorization": f"Bearer {token}"}, timeout=30).json()["login"]
    ref = config.token_ref("github", login)
    config.save_token(ref, token)
    conn = db.connect()
    row = conn.execute("SELECT id FROM accounts WHERE provider='github' AND username=?", (login,)).fetchone()
    if row:
        account_id = row["id"]
        conn.execute("UPDATE accounts SET token_ref=? WHERE id=?", (ref, account_id))
    else:
        account_id = conn.execute(
            "INSERT INTO accounts(provider,username,owner_url,token_ref,created_at) VALUES(?,?,?,?,?)",
            ("github", login, f"https://github.com/{login}", ref, datetime.now(timezone.utc).isoformat()),
        ).lastrowid
    conn.commit()
    conn.close()
    return {"status": "done", "account_id": account_id, "username": login}
