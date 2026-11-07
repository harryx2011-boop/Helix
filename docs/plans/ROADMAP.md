Status: IN PROGRESS

# Helix roadmap

State of record: `context.md`. Detail for each phase: the linked plan.

## Releases

- 2.3.2 (tag `v2.3.2`): current version; `main` is 70 commits past it, unreleased.
- 2.1.0: latest published installer (2026-09-26).
- 2.0.0 (2026-09-26): Helix became a Windows desktop app (`DESKTOP-PLAN.md`).

## Phases

Desktop plan (`DESKTOP-PLAN.md`): Phases 0-7 are DONE. Exit test: installer 2.1.0 launches and `helix_health` answers.

Suite plan (`2026-10-05-suite-plan.md`):

| # | Phase | Status | Exit test |
|---|---|---|---|
| 1 | Scraping efficiency and anti-bot | ACTIVE (new captured browser profiles open) | `bench-scrape.mjs` shows the claimed speedup |
| 2 | Search backend | see suite plan | Search answers on the SearXNG stack |
| 3 | `helix_image_sheet` | DONE 2026-10-16 | Tool returns JSON sheet and PNG grid |
| 4 | `helix_data_miner` (topic to table) | not started | Topic in, table out, with sources |
| 5 | Web monitoring that says what changed | not started | A monitor run returns a change summary |
| 6 | VS Code extension (`apps/vscode`) | not started | Extension shows monitor summaries |

Status per phase comes from `TODO.md` and `docs/next-session.md`; confirm in `context.md` before acting.
