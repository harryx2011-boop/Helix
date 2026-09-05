/**
 * The eight agent skills that ship with the Canvas Connect server, carried
 * across from the server repo's own `web/src/content/skills.ts` unchanged.
 *
 * `SkillIcon` names are Lucide exports; `lib/canvas-icons.ts` maps them to the
 * components so this file stays plain data and can be regenerated.
 */
export type SkillIcon =
  | "Sunrise"
  | "CalendarDays"
  | "TrendingUp"
  | "MessagesSquare"
  | "ListChecks"
  | "ClipboardCheck"
  | "Accessibility"
  | "Users";

export type Skill = {
  slug: string;
  name: string;
  audience: "student" | "educator";
  summary: string;
  triggers: string[];
  tools: string[];
  icon: SkillIcon;
};

export const skills: Skill[] = [
  {
    slug: "canvas-daily-check",
    name: "canvas-daily-check",
    audience: "student",
    summary: "Checks what's due today or this week, what's missing, and what announcements are unread across a student's Canvas courses.",
    triggers: ["what's due today", "check Canvas for me", "anything I'm missing"],
    tools: ["get_upcoming_assignments", "get_todo", "get_submission_status", "list_announcements"],
    icon: "Sunrise",
  },
  {
    slug: "canvas-week-plan",
    name: "canvas-week-plan",
    audience: "student",
    summary: "Builds a study plan for the week from a student's upcoming Canvas work, current grades, and course structure.",
    triggers: ["plan my week", "build a study schedule", "what should I work on"],
    tools: ["get_upcoming_assignments", "get_grades", "get_course_structure"],
    icon: "CalendarDays",
  },
  {
    slug: "canvas-grade-tracker",
    name: "canvas-grade-tracker",
    audience: "student",
    summary: "Tracks grades across courses, runs what-if scenarios on remaining points, and flags courses falling below a target threshold.",
    triggers: ["check my grades", "what do I need to get an A", "what-if I score X"],
    tools: ["get_grades", "list_assignments"],
    icon: "TrendingUp",
  },
  {
    slug: "canvas-discussion-helper",
    name: "canvas-discussion-helper",
    audience: "student",
    summary: "Reads a Canvas discussion thread, drafts a reply, and posts it after the student confirms.",
    triggers: ["help me reply to this discussion", "draft a discussion post", "respond to this thread"],
    tools: ["list_discussion_topics", "get_discussion_thread", "post_discussion_entry", "reply_to_discussion_entry"],
    icon: "MessagesSquare",
  },
  {
    slug: "canvas-bulk-grading",
    name: "canvas-bulk-grading",
    audience: "educator",
    summary: "Grades a batch of submissions for an assignment, with or without a rubric, using a preview-then-confirm loop.",
    triggers: ["grade these submissions", "bulk grade this assignment", "grade with the rubric"],
    tools: ["list_submissions", "list_rubrics", "get_rubric", "bulk_grade_submissions", "grade_with_rubric"],
    icon: "ListChecks",
  },
  {
    slug: "canvas-course-qc",
    name: "canvas-course-qc",
    audience: "educator",
    summary: "Quality-checks a Canvas course's structure, pages, assignments, and accessibility, and produces a punch list of issues to fix.",
    triggers: ["QC this course", "review my course before it goes live", "course quality check"],
    tools: ["get_course_structure", "list_pages", "list_assignments", "scan_course_content_accessibility"],
    icon: "ClipboardCheck",
  },
  {
    slug: "canvas-accessibility-audit",
    name: "canvas-accessibility-audit",
    audience: "educator",
    summary: "Scans a Canvas course for accessibility issues and fixes them after previewing the changes.",
    triggers: ["check accessibility", "fix accessibility issues", "UFIXIT report"],
    tools: [
      "scan_course_content_accessibility",
      "fetch_ufixit_report",
      "parse_ufixit_violations",
      "format_accessibility_summary",
      "fix_accessibility_issues",
    ],
    icon: "Accessibility",
  },
  {
    slug: "canvas-peer-review-manager",
    name: "canvas-peer-review-manager",
    audience: "educator",
    summary: "Tracks peer review completion for an assignment, finds students who owe a review, and messages them after confirmation.",
    triggers: ["who hasn't done their peer review", "chase down peer reviews", "peer review status"],
    tools: [
      "get_peer_review_completion_analytics",
      "get_peer_review_followup_list",
      "analyze_peer_review_quality",
      "identify_problematic_peer_reviews",
      "message_peer_reviewers",
      "send_peer_review_followups",
    ],
    icon: "Users",
  },
];
