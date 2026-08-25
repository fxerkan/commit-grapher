@echo off
REM commit-grapher — one-command setup & run (Windows / cmd.exe).
REM   start.bat        build the frontend once, then serve on http://localhost:8000
REM   start.bat dev    backend (:8000) + Vite hot-reload frontend (:5173)
REM ponytail: thin wrapper — the real logic lives in start.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
