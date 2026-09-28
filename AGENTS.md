# AGENTS.md

This is the agent entrypoint for the Digit YNAB MCP server repository. Keep it short, stable, and public-safe.

## Repo Identity

This repo contains the reusable local-first YNAB MCP server. It exposes typed MCP tools for YNAB reads, cache-backed reads, write planning, and optional write tools.

This repo is not a personal budget workspace and does not own hosted Digit app behavior. Keep personal workflow rules and product-app behavior in their own repos.

## Start Here

Read these files in order for non-trivial work:

1. `README.md`
2. `SECURITY.md`
3. `docs/tools.md`
4. `docs/exec-plans/index.md` for long-running work
5. `package.json`
6. Relevant source and tests under `src/`

## Working Context Banner

Before meaningful work, briefly state:

- repo: `ynab-mcp-server`;
- local rules: this `AGENTS.md`, `README.md`, and `SECURITY.md`;
- traversal surfaces: tool docs, package scripts, relevant tests/source;
- expected validation after edits.

## Safety Rules

- Never commit YNAB tokens, `.env` files, budget exports, cache files, account-level financial data, or runtime logs.
- Keep default behavior read-only unless tests or docs intentionally cover write-enabled mode.
- Treat write tools as safety-sensitive and preserve server-side write gating.
- In cache-read mode, preserve the distinction between live reads, sync, cache reads, and optional writes.
- Do not use `console.log` in MCP stdio paths because stdout is reserved for JSON-RPC protocol traffic.
- Keep public docs free of private local paths, real budget IDs, live write evidence, and personal finance details.

## Core Commands

Run from the repository root unless noted otherwise:

- `npm run build`
- `npm test`
- `npm run smoke:tools`
- `YNAB_MCP_ENABLE_WRITES=true npm run smoke:tools`
- `git diff --check`

## Planning Rule

Use `docs/exec-plans/active/` for multi-session features, major refactors, public-readiness work, packaging changes, or safety-sensitive behavior changes. Add each active plan to `docs/exec-plans/index.md`.
