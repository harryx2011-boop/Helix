---
name: canvas-peer-review-manager
description: Track peer review completion for an assignment, find students who owe a review, and message them after confirmation. Trigger phrases - "who hasn't done their peer review", "chase down peer reviews", "peer review status", "remind students about peer reviews".
---

# Canvas Peer Review Manager

Check peer review completion for an assignment, identify who still owes a review, and send reminders only after the educator approves the message.

## Prerequisites

- CanvasLMS - API connected and `canvaslms-api --test` succeeds.
- An educator-level Canvas token.
- The course and assignment with peer reviews assigned.

## Steps

1. Call `get_peer_review_completion_analytics` for the assignment to get overall completion rate and a per-student breakdown.
2. Call `get_peer_review_followup_list` to get the specific list of students who have not completed their assigned review(s), including who they were assigned to review.
3. Optionally call `analyze_peer_review_quality` and `identify_problematic_peer_reviews` to also flag completed-but-low-effort reviews (a handful of words, no specific feedback) alongside the missing ones.
4. Draft the reminder message: name the specific assignment, the specific peer(s) still owed a review, and the deadline if known. Show the draft and the full recipient list to the educator before sending anything.
5. Once approved, send it:
   - Targeted at flagged reviewers specifically: `message_peer_reviewers` with `confirm=true`.
   - Batch reminder to everyone on the followup list: `send_peer_review_followups` with `confirm=true`.
6. Report who the message went to.

## Output format

Status table first:

```
| Student | Reviews owed | Reviews completed | Quality flag |
|---|---|---|---|
| Name | 1 | 0 |: |
```

Then, before sending anything:

```
## Draft reminder
To: [N students, listed]
<message text>
```

After sending: `Sent to N students.` Never call `message_peer_reviewers` or `send_peer_review_followups` with `confirm=true` before the educator has seen and approved both the recipient list and the message text.
