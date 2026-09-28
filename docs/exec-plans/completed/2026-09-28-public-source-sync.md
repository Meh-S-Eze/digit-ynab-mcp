# Public MCP source synchronization

## Purpose

Update public `main` with the latest canonical local MCP source, dependencies,
Git-install support, and synthetic cache regression tests.

## Decisions

- Owner requested publication and explicitly waived build/test execution.
- Source baseline: local `847d459` plus the reviewed working-tree changes.
- Public parent: `d81d8c0`; publish a source snapshot to preserve public history
  without exposing local reference documents through intermediate commits.
- Exclude `docs/official-ynab/`: local research contains machine-specific paths
  and is not part of the runtime/package update.
- Preserve read-only defaults. No live YNAB operations, npm publication, hosted
  deployment, or credential changes are part of this task.

## Progress and acceptance

- [x] Compare public and local source and review changed files.
- [x] Prepare isolated publication snapshot, preserving the local working tree.
- [x] Retain synthetic cache tests and explicit package build preparation.
- [x] Scan snapshot for accidental credentials without verifying any secrets.
- [x] Commit and push to public `main`, then read back the remote commit.

Source publication commit: `64fca75da5722db0a29282b6bf354d20cd596c74`.
Push succeeded and GitHub's commits API returned this exact SHA for `main`.

Build and tests are intentionally not run for this publication. The current
snapshot must not be described as freshly build- or test-validated.

TruffleHog filesystem scan completed with exit 0 and no findings, with secret
verification and update checks disabled. All 80 compared source/package/test
files match the local snapshot byte for byte.

## Hosted web app maintenance notice

The owner subsequently stated that the Digit web app is no longer maintained.
The README now states this near the top, removes hosted-product promotion, and
explains that the standalone MCP does not require the web app or a Digit account.
Package homepage metadata points to this repository. The canonical local README
and package metadata received the same edits to prevent reintroducing old links.
This is a documentation/metadata change; MCP runtime behavior is unchanged.
