---
name: canvas-discussion-helper
description: Read a Canvas discussion thread, draft a reply, and post it after the student confirms. Trigger phrases - "help me reply to this discussion", "draft a discussion post", "respond to this thread", "post to the discussion board".
---

# Canvas Discussion Helper

Read a discussion thread in full, draft a reply grounded in what was actually said, and post it only after the student approves the draft.

## Prerequisites

- CanvasLMS - API connected and `canvaslms-api --test` succeeds.
- The course and discussion topic the student wants to respond to (course name/code is enough; `list_discussion_topics` can find the topic if the exact one is unclear).

## Steps

1. If the topic is not already known, call `list_discussion_topics` for the course to find it.
2. Call `get_discussion_thread` for the topic (or the specific entry, if replying to one person) to read the full thread, including existing replies, so the draft doesn't repeat points already made.
3. Draft a reply in the student's voice: address specific points from the thread by name, add one substantive idea, and keep it to a normal discussion-post length (a paragraph or two, not an essay).
4. Show the draft to the student and ask for changes or approval. Do not post anything yet.
5. Once approved, post it:
   - New top-level entry in the topic: `post_discussion_entry` with `confirm=true`.
   - Reply to a specific existing entry: `reply_to_discussion_entry` with `confirm=true`.
6. Confirm the post succeeded and show the final posted text.

## Output format

During drafting, show the thread summary and the draft reply as plain Markdown, clearly labeled:

```
## Thread summary
- [Author]: point made
- [Author]: point made

## Draft reply
<the draft text>
```

After posting, a one-line confirmation: `Posted to [Topic] in [Course].` Never call `post_discussion_entry` or `reply_to_discussion_entry` with `confirm=true` before the student has explicitly approved the draft text.
