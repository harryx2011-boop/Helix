# CanvasLMS - API

CanvasLMS - API is a local MCP server that puts your Canvas LMS account in front of an AI assistant. It runs on your machine, talks to Canvas with your own personal access token, and exposes about 100 tools covering courses, assignments, grading, discussions, modules, pages, files, messaging, peer reviews, and accessibility. Every tool returns Markdown. Every tool that changes Canvas previews its change first and only applies it once you confirm.

## Quick start

1. Get a Canvas personal access token: in Canvas go to **Account > Settings > Approved Integrations > New Access Token**.
2. Clone the repository and install it.

   ```bash
   git clone https://github.com/harryx2011-boop/CanvasLMS-API.git
   cd CanvasLMS-API
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

## Other clients

Any MCP client that supports stdio servers can launch the executable directly, the same way as Claude Code and Claude Desktop above.

For clients that only speak HTTP, run the server with the HTTP transport:

```bash
canvaslms-api --transport http --host 127.0.0.1 --port 7100
```

Point the client at `http://127.0.0.1:7100`. The server still reads Canvas credentials from `.env` in the repository folder.

## How it behaves

- **Course identifiers.** Any `course` argument accepts a numeric Canvas id, a course code (`ENG101`), part of a course name, or `sis_course_id:X`. Use `list_courses` first if you are not sure which one you want.
- **The confirm gate.** Every tool that changes Canvas takes a `confirm: bool = false` argument. Called without it, the tool returns a preview of what would change and makes no request that alters Canvas. Call it again with `confirm=true` after reviewing the preview.
- **Permissions.** Every tool runs as the token owner. A student token cannot see other students' private data or use educator tools such as grading or bulk messaging; those calls return the Canvas 403 with a hint about what permission is missing.
- **Output.** Every tool returns Markdown, formatted for direct display in a chat transcript.
- **Anonymization.** When `CANVAS_ANONYMIZE_STUDENTS=true`, student names in tool output are replaced with a stable per-course pseudonym instead of their real name.

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
| delete_announcement | Delete one announcement | confirm |
| delete_announcements | Delete multiple announcements by id | confirm |
| delete_announcements_matching | Delete announcements matching a filter | confirm |

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
| get_page | Fetch one page's metadata | |
| get_page_content | Fetch one page's body | |
| get_front_page | Fetch a course's front page | |
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
| list_peer_reviews | List peer review assignments for an assignment | |
| assign_peer_review | Assign a peer review | confirm |
| get_peer_review_assignments | List who is reviewing whom | |
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
| export_anonymization_map | Export the pseudonym-to-real-name mapping | confirm |
| get_privacy_status | Show whether anonymization is active | |

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
| `CANVAS_ANONYMIZE_STUDENTS` | no | `false` | Replace student names with stable pseudonyms in tool output. |
| `CANVAS_DOWNLOAD_DIR` | no | system temp directory | Where `download_file` writes downloaded files. |

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

## License

MIT. See `LICENSE`.
