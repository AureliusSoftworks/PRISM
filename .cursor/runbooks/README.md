# Runbook Catalog

This directory stores workspace-local runbooks that can be executed with `/run`.

## Status Legend
- `📘` Completed runbook
- `📖` In-progress workbook

## Completed Runbooks
- `📘 make_bot_export`: Create a researched, import-ready PRISM `.bot` export and save it under `.cursor/output/` without auto-importing.
- `📘 windows_server_app_port`: Implement and validate the Windows WPF + Inno Setup Prism Server app on a Windows machine.

## In-Progress Workbooks
- `📖 runbook-build-prod`: Merge latest `dev` into `main` without tooling and produce the production-ready build defined by the root README.

## Usage
- `/run make_bot_export`
- `/run windows_server_app_port`
- `/run windows_server_app_port validate existing artifact only`
- `/run runbook-build-prod`

## Invocation Rules
- Prefer workspace-local runbooks before personal fallback runbooks.
- Runbooks should be deterministic, failure-aware, and safe to execute from a fresh checkout.
- Do not mutate the planning file at `.cursor/plans/windows_server_app_port_9d65b04e.plan.md` while executing `windows_server_app_port`.

