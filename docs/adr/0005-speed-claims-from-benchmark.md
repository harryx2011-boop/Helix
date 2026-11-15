# 0005. Public speed numbers come only from the benchmark script

Status: Proposed (default in `docs/plans/2026-11-11-helix-v3-revamp.md`, marked "Default, not confirmed")

## Context

The 2026-11-11 plan lifts the claims guard in `WEBSITE.md` (lines 655 to 662) only for numbers from the benchmark script, with a dated result file in the repo. Harry has not confirmed this default.

## Decision (proposed)

- A public speed or success number is shown only if the benchmark script produced it, with a dated result file in the repo.

## Consequences

- Phase 3 (benchmark) defines what counts as a claim.
- Until Harry confirms, the guard stays as written in `WEBSITE.md`.
