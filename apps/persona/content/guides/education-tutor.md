---
config_keys:
  COMPANY_NAME: "Learning Platform"
  SUBJECT_DOMAIN: "General education"
  SUBJECT_AREA: "General homework"
  LEARNING_OBJECTIVES: "Student mastery of core concepts"
  PRIOR_KNOWLEDGE: "High school level"
  MAX_HINTS: "3"
  ASSESSMENT_METHOD: "Guided problem-solving"
  SESSION_LENGTH_MINUTES: "30"
  PARENT_OR_GUARDIAN_VISIBILITY: "No"
  GRADING_RUBRIC: "Assignment rubric provided by the instructor"
  ALLOWED_HINTS: "Specific corrections with explanations"
  ACADEMIC_INTEGRITY_POLICY: "Escalate to instructor"
  MAX_ISSUES_PER_PASS: "3"
  INSTRUCTOR_CONTACT: "The instructor"
  EXAM_NAME: "the exam"
  EXAM_DATE: "unscheduled"
  WEAK_AREAS: "To be diagnosed"
  PRACTICE_FORMAT: "Mixed-length timed sections"
  TARGET_SCORE: "To be set"
  ERROR_BUDGET: "5%"
  TARGET_LANGUAGE: "Spanish"
  LEARNER_LEVEL: "Intermediate"
  DIALECT_OR_REGION: "Standard"
  CONVERSATION_TOPICS: "Everyday scenarios"
  CORRECTION_STYLE: "Subtle mid-conversation"
  TURNS_BEFORE_TOPIC_SWITCH: "5"
  NATIVE_LANGUAGE_FALLBACK: ""
---
## Deploying in a tutoring platform

1. Pick a persona (Socratic Tutor, Exam Prep Coach, Homework Checker, or Language Practice Partner) and fill its configuration keys above; the wizard on this page substitutes them into the prompt automatically.
2. Paste the compiled prompt into the system-instructions field of your tutoring engine (your LMS, a chat widget, or a custom interface).
3. Expose student context to the model at session start: grade level or proficiency, current subject or exam, recent performance, and what the student wants (concept help, a problem, exam drilling, or conversation practice).
4. Wire feedback capture: log the structured outputs each persona already produces (progress notes, drill scorecards, corrected-exercise notes, session recaps) to your gradebook or progress tracker instead of re-parsing free text.
5. Test with three conversations before going live, matched to the persona deployed: a student revealing a misconception through questions, a student stuck mid-problem receiving hints up to the configured limit, and either an assessment, a timed drill, or a conversational recap depending on the persona. The assessment or drill step must check understanding without leaking the answer.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Knowledge base or curriculum content | All personas, all workflows | Yes |
| Student performance or drill history | Scaffolding, exam prep, revision checks | No |
| Quiz, drill or rubric content | Assessment, exam-prep, homework-review workflows | Yes for exam-prep and homework-checker |
| Progress or integrity-flag logging | End-of-session notes, integrity checks | No |
