# Plan: Canvas CLI + student-privacy (FERPA) hardening

> **Status:** plan only, nothing built yet. Written 2026-09-22 against canvas-mcp **v1.1.0**.
> **Scope:** `tools/canvas-mcp/` (Python package `canvaslms_api`, console script `canvaslms-api`).
> **Audience:** any future session picking this up. Read `tools/canvas-mcp/context.md` first; this file assumes it.
> **Not legal advice.** Part B lists the engineering controls and the questions for a lawyer or district privacy officer. Nothing here makes the tool "FERPA compliant" by itself: compliance comes from how a school or teacher deploys it, under what agreements.

---

## 0. Open scope questions (answer these before building)

These change the design. Until they're answered, build the defaults marked ★.

1. **Who is the operator in production?**
   ★ (a) one teacher, running it locally on their own classes, or (b) Helix/you offering it to schools or districts as a service. With (b) you become a vendor holding education records. That means DPAs, a security program, breach notice duties and state-law registration. It's a much bigger lift.
2. **K-12 or higher ed?** "Class period" suggests ★ K-12. That brings in COPPA for under-13s and the K-12 state student-privacy laws (§B3).
3. **Which LLM path is in production?** Claude Code / Desktop over stdio ★, claude.ai via the tunnel, or an API key (the Helix BYOK path). Each has different data-retention terms (§B4).
4. **What should the label be?** Proposed ★ `P3-07` (period 3, student 07). Alternatives: `3.07`, or a per-course number with no period. Also decide whether numbers are shared across a teacher's courses or scoped to each section.
5. **Does the CLI replace or join the MCP server?** Proposed ★: same package, one privacy layer, two front-ends (§A).

---

## Part A: CLI

### A1. What exists today

There is a CLI, but it only **launches the server**. It doesn't perform Canvas operations. See `src/canvaslms_api/cli.py:84` `main()`:

| Flag | Does |
|---|---|
| `--test` | connection check; prints the token owner's **real name** and up to 10 courses (`cli.py:41`) |
| `--config` | prints resolved settings, tokens masked |
| `--list-tools` | prints the 100 registered tool names |
| `--transport stdio\|http`, `--host`, `--port`, `--allowed-host` | runs the MCP server |
| `--version` | version |

There's no way to run, say, `list_submissions` from a terminal without an MCP client.

### A2. Proposed shape: a thin CLI over the same tools

Add subcommands and keep every existing flag working unchanged (bare `canvaslms-api` still runs stdio).

```
canvaslms-api tools [--search TEXT]                 # = --list-tools, with descriptions
canvaslms-api call <tool> [--arg k=v ...] [--json]  # run any of the 100 tools
canvaslms-api <tool> --course ENG101 ...            # sugar: auto-generated flags per tool
canvaslms-api privacy status                        # = get_privacy_status
canvaslms-api privacy roster <course>               # local-only: label -> real name (see B2.4)
canvaslms-api privacy scan <file|->                 # check text for leaked roster PII before pasting anywhere
canvaslms-api privacy purge [--older-than 30d]      # delete downloads / exports / crosswalk entries
canvaslms-api serve [--transport http ...]          # explicit alias for today's behaviour
```

**Implementation rule: no second code path.** The CLI calls tools through FastMCP's in-memory client (`fastmcp.Client(build_server(settings))` → `call_tool(name, args)`). It does not import tool functions directly. That way:
- the confirm gate works as before: without `--confirm` you get the preview; `--confirm` sends `confirm=true`, and the CLI also asks `[y/N]` on a TTY for `DESTRUCTIVE` tools;
- the privacy layer (Part B) sits on one path both front-ends go through, so the CLI can't bypass it;
- per-tool flags come from each tool's JSON Schema (`Literal` → `choices`, `bool` → `--flag/--no-flag`, `list` → repeatable).

Output is the tool's Markdown by default, with `--json` for structured output where a tool has it. Exit codes: 0 ok, 1 Canvas error, 2 config/usage error, 3 privacy-policy refusal.

### A3. Why the CLI matters for privacy

The **re-identification step happens here, on the teacher's machine, never in the model.** The model sees and says `P3-07`; only `privacy roster` (a local command, never exposed as an MCP tool) shows who that is. Today `export_anonymization_map` is an MCP tool, which means an LLM can call it and put the real-name map into its context. That undoes the whole scheme (§B2.5).

### A4. Tests
`tests/test_cli.py` exists. Add: subcommand parsing, `call` reaching a respx-mocked tool, confirm-gate preview vs `--confirm`, exit codes, and "bare invocation still runs stdio".

---

## Part B: student privacy / FERPA

### B1. What exists today, and the gaps

Anonymization is opt-in via `CANVAS_ANONYMIZE_STUDENTS` (default **false**, `config.py:51`). When it's on, `App.person()` (`app.py:28`) swaps names for `Student_xxxxxxxx`.

| # | Gap | Where | Severity |
|---|---|---|---|
| G1 | **The pseudonym can be reversed.** It's `sha256(host:user_id)`, an unkeyed hash of public inputs. Canvas user ids are small integers that classmates can see, so anyone can hash every id and reverse the label in seconds. This is the same mistake CLAUDE.md forbids for fingerprint seeds: keyed HMAC only. | `app.py:41-42` | **Critical** |
| G2 | **Off by default.** A teacher who forgets the env var sends real names to the model. Production has to fail closed. | `config.py:51,84` | **Critical** |
| G3 | **Free text isn't scrubbed.** Discussion bodies, Inbox bodies, submission comments and peer-review comments pass through `md.html_to_text` as they are. Students write each other's names ("I agree with Maya…"), sign posts, and paste emails. `person()` only covers the *author* field. | `discussions.py:106,126,164,229`, `messaging.py:130`, peer-review comment tools | **High** |
| G4 | **The real-name map can reach the model.** `export_anonymization_map` is an MCP tool that writes `real_name, canvas_user_id, anonymous_id` as plaintext CSV into the temp dir. | `people.py:145-198` | **High** |
| G5 | **Identifiers go out as-is.** Tables show the raw Canvas `id`. `check_enrollment` takes login/SIS/email as *input* from the model, and messages are built from `{name}` templates. | `people.py:51,95`, `messaging.py:240-274` | Medium |
| G6 | **Files land on disk with no retention.** `download_file` writes student submissions to the temp dir, and exports pile up there too. Nothing ever deletes them. | `files.py:184`, `peer_reviews.py:171` | Medium |
| G7 | **The label isn't the one you asked for.** `Student_ab12cd34` is opaque. The goal is number + class period. | `app.py:41` | Feature |
| G8 | **No tests for anonymization at all.** The only hit is config parsing. | `tests/` | High (a regression would be invisible) |
| G9 | **`--test` prints the token owner's real name.** That's the teacher, so it's fine, but the same code path must never print student data. | `cli.py:41` | Low |
| G10 | **The tunnel path sends student data through a third party.** `cloudflared` terminates TLS at Cloudflare. | README "Connect to Claude on the web" | Medium, a deployment issue (§B4) |

### B2. Target design: labels, not names

#### B2.1 Label format
`P<period>-<nn>`, e.g. `P3-07`. Teachers and TAs are labelled by role (`Teacher`, `TA-1`) or shown as-is. That's configurable, and staff aren't students under FERPA.

- **Period** comes from the student's Canvas **section**. Section names vary by district ("Period 3", "P3 - Bio", "03-BIO-1234"), so use a local mapping file, `privacy/periods.toml` (`section_id → period`), with a best-guess regex on first run that the teacher confirms. A student in several sections of one course takes the lowest period, with a warning.
- **Number** is assigned **once, at random, and persisted**. It is *not* alphabetical, because alphabetical order leaks surname initials, and *not* re-derived when the roster changes, because a student who adds or drops mid-term must not renumber everyone else. Numbers are never reused within a term.

#### B2.2 The crosswalk (the only place real identity lives)
- A local file, `~/.canvaslms-api/crosswalk.db` (SQLite), outside the repo and outside the download dir. Rows: `canvas_user_id, course_id, section_id, label, assigned_at, term`.
- **Encrypted at rest** with a key from the OS keychain (`keyring` package), with a fallback to `CANVAS_PRIVACY_KEY` in `.env`. File mode 0600.
- Real names **are not stored**. They're fetched live from Canvas when `privacy roster` runs, so a copied crosswalk alone maps labels to Canvas ids and not to names.
- Replaces G1: a label is a random assignment, not a hash, so there's nothing to reverse. Anything that needs a derived id (e.g. a stable key for an export) uses `HMAC-SHA256(CANVAS_PRIVACY_KEY, host:user_id)`.

#### B2.3 One privacy layer, applied to output **and** input
Put it in a new `privacy.py` that `App` owns, and route *everything* through it:

- **Outbound (Canvas → model):**
  - `person()` → label.
  - Raw Canvas user ids are dropped or replaced with the label in every table (G5).
  - **Free-text scrubbing (G3):** build a per-course dictionary from the roster (first, last, preferred/short, sortable name, login_id, email, SIS id). Replace every match with that student's label, using whole-word, case-insensitive matching, with possessives handled (`Maya's` → `P3-07's`). Unknown emails and phone numbers are redacted by regex. Mark each scrubbed block `_[names replaced]_` so the model knows.
  - Known limit, which the doc and tool output must say: dictionary scrubbing misses nicknames, misspellings and indirect identifiers ("the kid whose mom is the principal"). It's defence-in-depth, not a de-identification guarantee.
- **Inbound (model → Canvas):** any argument that names a student (`user_id`, `student_id`, recipient lists) accepts a **label** and resolves it locally to a Canvas id. The model never needs the real id.
- **Messages with names:** `send_bulk_messages` templates keep `{name}`, but it's filled in **locally at send time**, after the preview and confirm. The preview shows `Hi {name}` + labels, never the rendered real names.
- **`check_enrollment`** takes a login/email from the model by design, so in strict mode refuse it or restrict it to the CLI.

#### B2.4 Modes (fail closed)
`CANVAS_PRIVACY_MODE` = `off` | `pseudonymize` | ★`strict` (**new default**; `CANVAS_ANONYMIZE_STUDENTS=true` becomes an alias for `pseudonymize`).

| | off | pseudonymize | strict |
|---|---|---|---|
| names → labels | – | ✓ | ✓ |
| free-text scrub | – | ✓ | ✓ |
| raw ids hidden | – | – | ✓ |
| `export_anonymization_map` / re-ID over MCP | allowed | CLI only | CLI only |
| `download_file` of student submissions | allowed | allowed + retention | CLI only, retention enforced |
| HTTP transport off-loopback | as today | as today | refuses unless `CANVAS_PRIVACY_ACK_TUNNEL=1` |

`off` has to be set explicitly, and it logs a warning on every start. `get_privacy_status` reports the mode, the label scheme and the crosswalk location, never its contents.

#### B2.5 Remove re-identification from the MCP surface
Remove `export_anonymization_map` as an MCP tool in `pseudonymize`/`strict` (G4). Its job moves to `canvaslms-api privacy roster`, which prints to the terminal only and writes a file only with `--out`, encrypted by default. This changes the public tool count, so update `apps/dashboard/public/canvas/tools.json` and the counts in `apps/dashboard/lib/canvas.ts` in the same pass (see context.md "Presentation").

#### B2.6 Retention (G6)
- Downloads go to `~/.canvaslms-api/downloads/`, mode 0700, not the shared temp dir.
- `CANVAS_RETENTION_DAYS` (default 30); `privacy purge` deletes anything older, and the server runs the purge on startup.
- End of term: `privacy purge --term` removes that term's crosswalk rows.

#### B2.7 Audit log
Local, append-only JSONL: timestamp, tool, course id, **labels** touched, confirm yes/no, mode. No names, no free text. That lets a teacher answer "what did the assistant access?", which parents may ask about under FERPA's right of access.

### B3. Legal checklist (questions for counsel / the district)

These are the laws and terms the design has to support, **not conclusions**. Mark each one confirmed with the district or counsel before a production launch.

- **FERPA (20 U.S.C. §1232g; 34 CFR Part 99).** Grades, submissions, comments and rosters tied to a student are education records.
  - Sending them to an LLM provider is a disclosure. The usual basis is the **school-official exception** (§99.31(a)(1)(i)(B)), which requires that the provider does an institutional service, is under the school's **direct control** over use and maintenance of the records, and uses them only for the authorized purpose. In practice that means a **district-approved agreement** with the AI provider (and with Helix, if Helix hosts). A teacher's personal Claude account usually doesn't meet this. **Ask the district whether its agreements cover the AI tool the teacher uses.**
  - Pseudonymized ≠ de-identified. `P3-07` plus grades, still linkable through the crosswalk, is **still an education record** and still protected. Only aggregated, re-identification-risk-reviewed output (§99.31(b)(1)) is outside FERPA. Small cells matter: a period with 3 students, or "the only student with an IEP", can be identified.
  - Directory information (name, etc.) can be disclosed only if the district designated it and the parent didn't opt out. Don't rely on it for this tool.
- **Sensitive categories.** IEP/504 accommodations, disability, discipline, health: never send these to the model. Canvas "accommodations" often show up as assignment overrides or extended-time notes, so flag and suppress them in strict mode.
- **COPPA** (under 13): schools can consent on parents' behalf only for educational use, with no commercial use or training on the data.
- **PPRA**: only relevant if the tool is used to survey students on protected topics.
- **State K-12 student-privacy laws**, which are often stricter than FERPA and apply to *operators*: e.g. California SOPIPA / AB 1584, New York Ed Law §2-d (Parents' Bill of Rights, a required security standard, contract terms), Illinois SOPPA, Colorado, Connecticut, Texas. If the operator is (b) in §0, you probably need the district's **DPA** (many use the Student Data Privacy Consortium's NDPA). **Ask which state(s).**
- **District policy on Canvas tokens.** Many districts forbid personal access tokens for third-party tools and require an admin-issued developer key or LTI. **Ask.**
- **Accessibility** (the `accessibility` tool group): ADA Title II web rule and Section 504 apply to course content. Adjacent, not privacy, but it's the other compliance question schools will ask.

### B4. Deployment requirements (not code, but they belong in the README)
- **LLM provider terms:** production requires an account/plan with **no training on inputs**, defined retention (ideally zero data retention), and a DPA the school accepts. Record which plan qualifies here once confirmed; don't guess.
- **Prefer stdio.** The claude.ai tunnel path routes decrypted traffic through the tunnel provider. Strict mode gates it (§B2.4).
- **Device:** full-disk encryption and a locked screen on the teacher's machine, since the crosswalk and downloads live there.
- **Breach:** document who to tell (district privacy officer) and how fast. State laws set deadlines.

### B5. Claims guard
Per `WEBSITE.md` §11 and CLAUDE.md: the `/canvas` marketing pages and README must **not** say "FERPA compliant" or "FERPA certified". No such certification exists, and compliance depends on the deployment. Allowed wording is factual: "names are replaced with class-period labels before anything reaches the assistant", "real identities stay on your machine". And no counts, per the claims guard.

---

## C. Build order (each step is one PR, tests first)

1. **Tests that pin today's behaviour** of `person()` / anonymization (G8). They should fail after step 2, and that's intended.
2. **HMAC fix** (G1). Replace `sha256(host:id)` with HMAC under `CANVAS_PRIVACY_KEY`. Small, independent, ship it first.
3. **`privacy.py` + crosswalk + `P<period>-<nn>` labels** (B2.1–B2.2), `periods.toml`, `privacy status`.
4. **Output scrubbing everywhere** (B2.3 outbound). Audit every `tools/*.py` for raw `id`, `html_to_text` of student text, and `participants`. Grep: `person(`, `html_to_text(`, `"id"`, `user_id`.
5. **Input label resolution** (B2.3 inbound) and local `{name}` filling for messages.
6. **Modes + fail-closed default** (B2.4). Minor version bump (behaviour change) and a CHANGELOG entry.
7. **CLI subcommands** (Part A) including `privacy roster|scan|purge`. Move `export_anonymization_map` off MCP (B2.5).
8. **Retention + audit log** (B2.6–B2.7).
9. **Docs + site**: README privacy section, B4 deployment notes, context.md, `tools.json` and the counts in `lib/canvas.ts`, and a claims-guard review of `/canvas` copy.

Versioning: canvas-mcp carries its own version (`pyproject.toml` / `__init__.py`). Bump it there, not the Helix root. Tests run on their own: `cd tools/canvas-mcp && pytest && ruff check .` (not reached by `pnpm -r test`).

## D. Definition of done
- A `strict`-mode run of every read tool against a fixture course with names seeded into free text produces **zero** roster names, emails, login ids, SIS ids or raw Canvas user ids in the output. Add this as an automated test that loops over all tools.
- No MCP tool can return a real name in `pseudonymize`/`strict`.
- The crosswalk can't be read without the key; labels are stable across roster changes; numbers are never reused within a term.
- §0 questions answered and §B3 items marked confirmed by the district or counsel before anyone calls it production-ready.
