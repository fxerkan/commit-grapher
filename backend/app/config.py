"""Token storage. PATs live in the OS keychain (keyring), never on disk/CLI.

The DB stores only a ``token_ref`` (e.g. "github:octocat"); the secret itself is
resolved here at crawl time.
"""
from __future__ import annotations

import keyring

SERVICE = "commit-grapher"


def token_ref(provider: str, username: str) -> str:
    return f"{provider}:{username}"


def save_token(ref: str, token: str) -> None:
    keyring.set_password(SERVICE, ref, token)


def get_token(ref: str) -> str | None:
    return keyring.get_password(SERVICE, ref)


def delete_token(ref: str) -> None:
    try:
        keyring.delete_password(SERVICE, ref)
    except keyring.errors.PasswordDeleteError:
        pass
