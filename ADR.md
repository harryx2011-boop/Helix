# Architecture decisions

An ADR here records one decision that shapes Helix: what was chosen, why, and what it costs. Each one is a numbered file in `docs/adr/`.

| # | Decision | Status | File |
|---|---|---|---|
| 0001 | Merge Scrapling into Helix as a new `helix-scrape` service | Accepted | [0001](docs/adr/0001-scrapling.md) |
| 0002 | Ship full Chromium (`channel: 'chromium'`) for the browser tier | Accepted | [0002](docs/adr/0002-full-chromium-channel.md) |
| 0003 | SearXNG search runs on a URL the user sets, not a bundled Docker | Accepted | [0003](docs/adr/0003-searxng-user-url.md) |
| 0004 | UI revamp takes Firecrawl's patterns, not its look | Accepted | [0004](docs/adr/0004-no-firecrawl-look-copy.md) |
| 0005 | Public speed numbers come only from the benchmark script | Proposed | [0005](docs/adr/0005-speed-claims-from-benchmark.md) |

New decision: add docs/adr/NNNN-short-title.md and a row here.
