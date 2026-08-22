"""SQLite cache of git *metadata* (no file contents). Raw sqlite, no ORM.

# ponytail: raw sqlite3 + a module-level connection; add SQLAlchemy/pooling only
# if schema churn or concurrency actually hurt.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "cache.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id            INTEGER PRIMARY KEY,
    provider      TEXT NOT NULL,
    username      TEXT NOT NULL,
    owner_url     TEXT NOT NULL,
    token_ref     TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    last_synced_at TEXT,
    UNIQUE(provider, username)
);
CREATE TABLE IF NOT EXISTS repos (
    id            INTEGER PRIMARY KEY,
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    url           TEXT NOT NULL,
    default_branch TEXT,
    last_synced_at TEXT,
    UNIQUE(account_id, full_name)
);
CREATE TABLE IF NOT EXISTS branches (
    id       INTEGER PRIMARY KEY,
    repo_id  INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    name     TEXT NOT NULL,
    UNIQUE(repo_id, name)
);
CREATE TABLE IF NOT EXISTS pull_requests (
    id            INTEGER PRIMARY KEY,
    repo_id       INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    number        INTEGER NOT NULL,
    title         TEXT,
    state         TEXT,
    author        TEXT,
    source_branch TEXT,
    target_branch TEXT,
    created_at    TEXT,
    merged_at     TEXT,
    UNIQUE(repo_id, number)
);
CREATE TABLE IF NOT EXISTS commits (
    sha          TEXT NOT NULL,
    repo_id      INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    branch_ref   TEXT,
    author       TEXT,
    author_email TEXT,
    message      TEXT,
    committed_at TEXT,
    url          TEXT,
    parents      TEXT,   -- comma-separated parent SHAs (for the git-graph DAG)
    PRIMARY KEY (repo_id, sha)
);
CREATE INDEX IF NOT EXISTS idx_commits_committed_at ON commits(committed_at);
"""

# Columns added after initial release; ALTER on existing DBs (sqlite has no ADD COLUMN IF NOT EXISTS).
_MIGRATIONS = {"commits": {"url": "TEXT", "parents": "TEXT"}, "accounts": {"display_name": "TEXT"}}


def _migrate(conn: sqlite3.Connection) -> None:
    for table, cols in _MIGRATIONS.items():
        existing = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
        for col, decl in cols.items():
            if col not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init() -> None:
    conn = connect()
    conn.executescript(SCHEMA)
    _migrate(conn)
    conn.commit()
    conn.close()
