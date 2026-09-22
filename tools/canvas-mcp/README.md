# CanvasLMS - API

CanvasLMS - API is a local MCP server that puts your Canvas LMS account in front of an AI assistant. It runs on your machine, talks to Canvas with your own personal access token, and exposes about 95 tools covering courses, assignments, grading, discussions, modules, pages, files, messaging, peer reviews, and accessibility. Every tool returns Markdown. Every tool that changes Canvas previews its change first and only applies it once you confirm.

## Quick start

1. Get a Canvas personal access token: in Canvas go to **Account > Settings > Approved Integrations > New Access Token**.
2. Clone the repository and install it.

   ```bash
   git clone https://github.com/harryx2011-boop/Helix.git
   cd Helix/tools/canvas-mcp
   uv venv .venv
   uv pip install -e .
   ```

   Without `uv`, use a standard virtual environment instead:

   ```bash
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   source .venv/bin/activate # macOS/Linux
   pip install -e .
   ```

3. Copy the example environment file and fill in your Canvas host and token.

   ```bash
   cp .env.example .env
   ```

4. Verify the connection.

   ```bash
   canvaslms-api --test
   ```

   This prints your name, user id, and active courses. If it fails, check `CANVAS_URL` and `CANVAS_TOKEN` in `.env`.

## Connect to Claude Code

Windows:

```bash
claude mcp add --scope user canvaslms-api -- "<absolute path>\.venv\Scripts\canvaslms-api.exe"
```

macOS/Linux:

```bash
claude mcp add --scope user canvaslms-api -- "<absolute path>/.venv/bin/canvaslms-api"
```

The server reads `.env` from the repository folder at startup, so no environment variables need to go in the client configuration. Use the absolute path to the executable inside `.venv`.

## Connect to Claude Desktop

Add an entry to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "canvaslms-api": {
      "command": "<absolute path>\\.venv\\Scripts\\canvaslms-api.exe"
    }
  }
}
```

On macOS/Linux, use `<absolute path>/.venv/bin/canvaslms-api` for `command`.

Config file locations:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Restart Claude Desktop after editing the file.

## Connect to Claude on the web

Claude on the web (claude.ai) reaches an MCP server from Anthropic's servers, not
from your browser, so `localhost` will not do: the server needs a public HTTPS
URL. That means anything that can reach the URL can use your Canvas token, so
the server refuses to listen beyond localhost until you set a shared secret.

1. Generate a secret and add it to `.env`.

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

   ```
   CANVAS_MCP_AUTH_TOKEN=<the generated value>
   ```

2. Start the server.

   ```bash
   canvaslms-api --transport http
   ```

3. Give it a public HTTPS URL. Any tunnel works; `cloudflared` needs no account:

   ```bash
   cloudflared tunnel --url http://127.0.0.1:7100
   ```

   It prints a hostname such as `https://mild-owl-quiet.trycloudflare.com`. Add
   that hostname to `.env` as `CANVAS_MCP_ALLOWED_HOSTS` and restart the server,
   which turns on Host header validation:

   ```
   CANVAS_MCP_ALLOWED_HOSTS=mild-owl-quiet.trycloudflare.com
   ```

4. In claude.ai, go to **Settings > Connectors > Add custom connector** and enter
   the URL with the secret in its path:

   ```
   https://mild-owl-quiet.trycloudflare.com/s/<CANVAS_MCP_AUTH_TOKEN>/mcp
   ```

   The connector dialog takes a URL and nothing else, which is why the secret
   goes in the path. Clients that can send headers should use
   `Authorization: Bearer <CANVAS_MCP_AUTH_TOKEN>` against `/mcp` instead.

Check it from the command line before adding the connector:

```bash
curl -sS -X POST https://mild-owl-quiet.trycloudflare.com/s/<CANVAS_MCP_AUTH_TOKEN>/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

A JSON-RPC result means the connector will work. `401` means the secret in the
URL is wrong; `421` means the hostname is missing from `CANVAS_MCP_ALLOWED_HOSTS`.

In the default strict privacy mode the server also needs
`CANVAS_PRIVACY_ACK_TUNNEL=1` before it will serve through a tunnel. A tunnel
provider terminates TLS on its own servers, so tool results, student data
included, pass through it in the clear. Set it only if your school has
approved that.

What to know before relying on this:

- **Your machine is the server.** The connector works only while both
  `canvaslms-api` and the tunnel are running.
- **A free `trycloudflare.com` URL is temporary.** It changes every time you
  restart the tunnel, and the connector URL changes with it. A named tunnel on
  your own domain keeps a stable address.
- **The URL is the credential.** Anyone holding it has your Canvas access.
  Rotate `CANVAS_MCP_AUTH_TOKEN` and update the connector if it leaks.
- **Custom connectors are a paid-plan feature** on claude.ai.

## Other clients

Any MCP client that supports stdio servers can launch the executable directly, the same way as Claude Code and Claude Desktop above.

For clients that only speak HTTP, run the server with the HTTP transport:

```bash
canvaslms-api --transport http --host 127.0.0.1 --port 7100
```

Point the client at `http://127.0.0.1:7100/mcp`. The server still reads Canvas
credentials from `.env` in the repository folder. On localhost it runs
unauthenticated; set `CANVAS_MCP_AUTH_TOKEN` to require a bearer token, which is
mandatory before it will bind anywhere else.

## How it behaves

- **Course identifiers.** Any `course` argument accepts a numeric Canvas id, a course code (`ENG101`), part of a course name, or `sis_course_id:X`. Use `list_courses` first if you are not sure which one you want.
- **The confirm gate.** Every tool that changes Canvas takes a `confirm: bool = false` argument. Called without it, the tool returns a preview of what would change and makes no request that alters Canvas. Call it again with `confirm=true` after reviewing the preview.
- **Permissions.** Every tool runs as the token owner. A student token cannot see other students' private data or use educator tools such as grading or bulk messaging; those calls return the Canvas 403 with a hint about what permission is missing.
- **Output.** Every tool returns Markdown, formatted for direct display in a chat transcript.
- **Student privacy.** On by default. Students appear as class-period labels like `P3-07`, never by name. See [Student privacy](#student-privacy).

## Student privacy

Everything a tool returns goes to your AI provider. With privacy on (the default), student identities stay on your machine:

- **Labels, not names.** A student is `P3-07`: period 3, student 07. The period comes from the Canvas section name ("Period 3", "P3 Bio", "Pd. 05"). If a section has no recognisable period, its students are `S-07`. Guardians are `Guardian-xxxxxx`. Anyone the server can't place on a course roster is `Person-xxxxxxxx`. Teachers and TAs keep their names.
- **Stable and meaningless.** Each number is drawn at random the first time a student is seen, then kept. It isn't alphabetical, doesn't shift when someone adds or drops, and is never reused.
- **Names in text too.** Discussion posts, messages, comments and errors are scrubbed with each course's roster: full names, first and last names, emails, login ids and SIS ids become the label. A first name two students share becomes `[student]`. In strict mode, any other email address or phone number is redacted too.
- **Labels work as input.** Ask for "P3-07's submission" and the label becomes the Canvas id locally. Write "Nice work, P3-07" in a message and Canvas receives the student's real name. The assistant only ever sees the label, and the tool result says when a swap happened.
- **You look people up, the assistant doesn't.** `canvaslms-api privacy roster <course>` prints who each label is, in your terminal. Over MCP, the name map is refused.

This is pseudonymization, not de-identification. A label plus grades is still an education record under FERPA. Dictionary scrubbing also misses nicknames, misspellings and indirect details ("the student whose mom coaches soccer"). Whether you can send student data to an AI provider at all depends on your school's agreements with that provider, so check with your district before relying on this.

| Mode (`CANVAS_PRIVACY_MODE`) | What the assistant sees |
|---|---|
| `strict` (default) | Labels for students, names scrubbed from text, other emails and phones redacted, raw student ids replaced with labels. Refuses to serve through a tunnel unless `CANVAS_PRIVACY_ACK_TUNNEL=1`. |
| `pseudonymize` | Labels and scrubbed names; raw Canvas ids and other emails left as they are. `CANVAS_ANONYMIZE_STUDENTS=true` means this. |
| `off` | Real names and ids. The server warns on every start. |

Files, all under `~/.canvaslms-api/` (or `CANVAS_PRIVACY_DIR`) and readable only by you:

| File | Holds |
|---|---|
| `privacy.key` | The key labels are derived from. Back it up with the crosswalk; without it, every student gets a new label. Set `CANVAS_PRIVACY_KEY` to keep it elsewhere. |
| `crosswalk.db` | Label assignments: a keyed hash of each Canvas user id and its label. No ids, no names. |
| `periods.toml` | Your overrides for sections whose period was guessed wrong. |
| `audit.jsonl` | One line per tool call: tool, course, confirm, outcome and labels. No names, no text. |
| `downloads/` | Files `download_file` saves, purged after `CANVAS_RETENTION_DAYS` (default 30). |

## Command line

Every tool also runs from the terminal, through the same server and privacy layer:

```bash
canvaslms-api tools --search grade                          # find a tool
canvaslms-api call list_users course=BIO101                 # run one; values parse as JSON when they can
canvaslms-api call grade_with_rubric course=BIO101 assignment_id=12 user_id=P3-07 \
  rubric_assessment='{"crit_1": 4}'                         # preview
canvaslms-api call ... --confirm                            # apply (asks first if it can't be undone)
canvaslms-api serve --transport http                        # same as the bare command
```

Privacy commands that never go through the assistant:

```bash
canvaslms-api privacy status                       # mode, files, retention
canvaslms-api privacy roster BIO101                # who each label is: terminal only
canvaslms-api privacy roster BIO101 --out map.csv  # same, as a file only you can read
canvaslms-api privacy periods BIO101               # how sections map to periods
canvaslms-api privacy periods BIO101 --set 4812=3  # fix a wrong guess
canvaslms-api privacy scan notes.txt               # any student names in here? (exit 3 if so)
canvaslms-api privacy scan notes.txt --redact      # print a copy with labels instead
canvaslms-api privacy purge --crosswalk            # end of term: drop old downloads and every label
```

Exit codes: 0 ok, 1 Canvas error, 2 usage or config error, 3 refused for privacy or scan found names.

## Tool reference

Write tools (marked **confirm**) return a preview until called again with `confirm=true`.

### Courses & identity

| Tool | Purpose | confirm |
|---|---|---|
| get_profile | Fetch the token owner's Canvas profile | |
| get_enrollments | List the token owner's enrollments across courses | |
| list_courses | List and search courses the token owner can see | |
| get_course | Fetch details for one course | |
| get_syllabus | Fetch a course's syllabus body | |
| get_course_overview | Summarize a course: syllabus, modules, upcoming work | |
| get_course_structure | Fetch a course's full modules/pages/assignments outline | |
| get_cache_status | Show what course-resolution data is cached | |
| clear_cache | Clear the course-resolution cache | |

### Student

| Tool | Purpose | confirm |
|---|---|---|
| get_upcoming_assignments | List assignments due soon across courses | |
| get_todo | Fetch the Canvas to-do list | |
| get_submission_status | Show submitted/missing/graded status for a course | |
| get_grades | Fetch current grades for one or all courses | |
| get_pending_peer_reviews | List peer reviews still owed by the token owner | |
| get_submission | Fetch one submission's detail and feedback | |
| submit_assignment | Submit an assignment | confirm |
| comment_on_submission | Add a comment to a submission | confirm |
| mark_module_item_done | Mark a module item complete | confirm |

### Assignments & grading

| Tool | Purpose | confirm |
|---|---|---|
| list_assignments | List a course's assignments | |
| get_assignment | Fetch one assignment's detail | |
| list_submissions | List submissions for an assignment | |
| get_assignment_analytics | Summarize submission and grade distribution for an assignment | |
| get_student_analytics | Summarize one student's activity in a course | |
| create_assignment | Create an assignment | confirm |
| update_assignment | Update an assignment | confirm |
| bulk_grade_submissions | Grade multiple submissions in one call | confirm |
| grade_with_rubric | Grade a submission against a rubric | confirm |

### Rubrics

| Tool | Purpose | confirm |
|---|---|---|
| list_rubrics | List a course's rubrics | |
| get_rubric | Fetch one rubric's criteria | |
| get_rubric_assessment | Fetch a submission's rubric assessment | |
| create_rubric | Create a rubric | confirm |
| create_rubric_from_csv | Create a rubric from a CSV definition | confirm |
| associate_rubric | Attach a rubric to an assignment | confirm |

### Discussions & announcements

| Tool | Purpose | confirm |
|---|---|---|
| list_discussion_topics | List a course's discussion topics | |
| get_discussion_topic | Fetch one discussion topic | |
| list_discussion_entries | List top-level entries in a topic | |
| get_discussion_entry | Fetch one discussion entry | |
| get_discussion_thread | Fetch a full thread with replies | |
| post_discussion_entry | Post a new entry to a topic | confirm |
| reply_to_discussion_entry | Reply to an existing entry | confirm |
| create_discussion_topic | Create a discussion topic | confirm |
| update_discussion_topic | Update a discussion topic | confirm |
| list_announcements | List a course's announcements | |
| create_announcement | Create an announcement | confirm |
| delete_announcements | Delete announcements by id, or by title/date filter | confirm |

### Modules

| Tool | Purpose | confirm |
|---|---|---|
| list_modules | List a course's modules | |
| list_module_items | List items in a module | |
| create_module | Create a module | confirm |
| update_module | Update a module | confirm |
| delete_module | Delete a module | confirm |
| add_module_item | Add an item to a module | confirm |
| update_module_item | Update a module item | confirm |
| delete_module_item | Delete a module item | confirm |

### Pages

| Tool | Purpose | confirm |
|---|---|---|
| list_pages | List a course's pages | |
| get_page | Fetch one page's metadata and body (`front_page` for the front page) | |
| create_page | Create a page | confirm |
| edit_page_content | Replace a page's body | confirm |
| update_page_settings | Update a page's settings (title, publish state, editing rights) | confirm |
| bulk_update_pages | Apply the same edit across multiple pages | confirm |
| delete_page | Delete a page | confirm |

### Files

| Tool | Purpose | confirm |
|---|---|---|
| list_files | List a course's files | |
| read_file | Read a text file's content | |
| download_file | Download a file to disk | |
| upload_file | Upload a file to a course | confirm |

### Messaging

| Tool | Purpose | confirm |
|---|---|---|
| list_conversations | List Canvas Inbox conversations | |
| get_conversation | Fetch one conversation's messages | |
| get_unread_count | Get the unread message count | |
| mark_conversations_read | Mark conversations as read | confirm |
| send_conversation | Send a new message | confirm |
| send_bulk_messages | Send the same message to multiple recipients | confirm |

### Peer reviews

| Tool | Purpose | confirm |
|---|---|---|
| assign_peer_review | Assign a peer review | confirm |
| get_peer_review_assignments | List every peer review: who reviews whom, state, comments | |
| get_peer_review_completion_analytics | Summarize peer review completion rates | |
| get_peer_review_followup_list | List students who still owe a peer review | |
| get_peer_review_comments | Fetch comments left in a peer review | |
| analyze_peer_review_quality | Score peer review feedback for depth and usefulness | |
| identify_problematic_peer_reviews | Flag low-effort or missing peer reviews | |
| generate_peer_review_report | Build a summary report of peer review activity | |
| generate_peer_review_feedback_report | Build a report of feedback content across peer reviews | |
| extract_peer_review_dataset | Export peer review data for analysis | |
| message_peer_reviewers | Message students about their peer review assignments | confirm |
| send_peer_review_followups | Send reminders to students with outstanding peer reviews | confirm |

### People & privacy

| Tool | Purpose | confirm |
|---|---|---|
| list_users | List a course's enrolled users | |
| list_groups | List a course's groups | |
| check_enrollment | Check one user's enrollment in a course | |
| export_anonymization_map | Export the label-to-real-name mapping (terminal only while privacy is on) | confirm |
| get_privacy_status | Show the privacy mode and how labels are made | |

### Accessibility

| Tool | Purpose | confirm |
|---|---|---|
| scan_course_content_accessibility | Scan a course's pages and files for accessibility issues | |
| fix_accessibility_issues | Apply fixes for detected accessibility issues | confirm |
| fetch_ufixit_report | Fetch an existing UFIXIT accessibility report | |
| parse_ufixit_violations | Parse violations out of a UFIXIT report | |
| format_accessibility_summary | Format an accessibility scan as a readable summary | |

### Course copy

| Tool | Purpose | confirm |
|---|---|---|
| create_content_migration | Start a course content migration/copy | confirm |
| get_content_migration_status | Check a content migration's progress | |

### Meta

| Tool | Purpose | confirm |
|---|---|---|
| search_tools | Search the available tools by keyword | |

## Configuration

All configuration comes from environment variables, loaded from a `.env` file in the repository root.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `CANVAS_URL` | yes | | Your Canvas host, e.g. `https://yourschool.instructure.com`. No `/api/v1` suffix. |
| `CANVAS_TOKEN` | yes | | Your Canvas personal access token. |
| `CANVAS_TIMEOUT` | no | `30` | HTTP request timeout, in seconds. |
| `CANVAS_CACHE_TTL` | no | `300` | How long course-resolution results are cached, in seconds. |
| `CANVAS_MAX_CONCURRENCY` | no | `5` | Maximum concurrent requests to Canvas. |
| `CANVAS_PRIVACY_MODE` | no | `strict` | `strict`, `pseudonymize` or `off`. See [Student privacy](#student-privacy). |
| `CANVAS_ANONYMIZE_STUDENTS` | no | | Legacy. `true` means `pseudonymize`; `false` no longer turns privacy off. |
| `CANVAS_PRIVACY_DIR` | no | `~/.canvaslms-api` | Where the key, crosswalk, audit log and private downloads live. |
| `CANVAS_PRIVACY_KEY` | no | key file in the privacy dir | Label key, 16+ characters, if you'd rather not keep it on disk next to the crosswalk. |
| `CANVAS_RETENTION_DAYS` | no | `30` | Age at which files in the private download folder are deleted. |
| `CANVAS_PRIVACY_ACK_TUNNEL` | no | | Set to `1` to let strict mode serve through a tunnel your school has approved. |
| `CANVAS_DOWNLOAD_DIR` | no | `<privacy dir>/downloads`, or system temp with privacy off | Where `download_file` writes downloaded files. A folder you set here is never purged. |
| `CANVAS_MCP_AUTH_TOKEN` | no | | Shared secret required by the HTTP transport, as a bearer token or an `/s/<token>` URL prefix. Required to serve beyond localhost. Minimum 16 characters. |
| `CANVAS_MCP_ALLOWED_HOSTS` | no | | Comma-separated hostnames allowed in the `Host` header over HTTP. Setting it turns on Host/Origin validation. |

Run `canvaslms-api --config` to print the resolved configuration, with the token masked.

## Development

Install with dev extras:

```bash
uv pip install -e ".[dev]"
```

Run tests:

```bash
pytest
```

Lint:

```bash
ruff check .
```

CI runs tests and lint on every push. A Docker image is also available; its entrypoint is `canvaslms-api`.

Useful CLI flags during development: `canvaslms-api --list-tools` prints every registered tool name, `canvaslms-api --config` prints resolved settings, `canvaslms-api --version` prints the installed version.

## Security notes

- Your Canvas token stays local. It is read from `.env` on startup and used only to call the Canvas API you configured.
- The token is never logged. `--config` and `get_privacy_status` mask it.
- Write tools require an explicit `confirm=true` after a preview. Nothing changes in Canvas by accident.
- `download_file` will not overwrite an existing file at the destination path.
- The HTTP transport will not bind past localhost without `CANVAS_MCP_AUTH_TOKEN`; unauthenticated requests get a `401`.
- Exposing the server publicly makes the connector URL equivalent to your Canvas token. Prefer stdio unless you need Claude on the web.
- Student privacy is on by default: labels instead of names, keyed so they can't be reversed from public ids, with the name map available only in your terminal. See [Student privacy](#student-privacy) for what it does and doesn't cover.

## License

MIT. See `LICENSE`.
