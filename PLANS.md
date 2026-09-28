# Execution Plans

This repository uses execution plans for work that is too large or safety-sensitive to rely on chat history alone.

## When To Use A Plan

Create or update a plan when work:

- spans multiple sessions or branches;
- changes MCP tool behavior, write gates, cache semantics, packaging, or public docs;
- carries security, privacy, or public-readiness risk;
- needs durable validation evidence.

Small local fixes do not need a plan. Large or risky work does.

## Where Plans Live

- Active plans live in `docs/exec-plans/active/`.
- Completed plans live in `docs/exec-plans/completed/`.
- The inventory lives in `docs/exec-plans/index.md`.
- Handoffs and support notes live in `docs/exec-plans/handoffs/` and `docs/exec-plans/support/`.

## Required Shape

Every active plan should include:

- purpose and done criteria;
- current status and progress checkboxes;
- important decisions;
- files, commands, and interfaces involved;
- validation and acceptance evidence;
- open blockers or follow-up risks.

Update the plan at meaningful stopping points, and move completed plans out of `active/`.
