---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  WCAG_TARGET_LEVEL: "AA"
  WCAG_REFERENCES_URL: "https://www.w3.org/WAI/WCAG22/quickref/"
  ISSUE_TRACKING_URL: "https://jira.example.com/a11y"
  PLAIN_LANGUAGE_GUIDELINES_URL: "https://www.plainlanguage.gov"
  CONTENT_AUDIT_URL: "https://docs.example.com/content"
  SUPPORTED_ASSISTIVE_TECH: "NVDA, JAWS, VoiceOver, TalkBack"
  TEST_COVERAGE_URL: "https://docs.example.com/a11y-matrix"
---
## Deploying in an accessibility workflow

1. Configure the WCAG target level (A, AA, AAA), point to your WCAG reference documentation and issue-tracking system. Fill in your accessibility testing matrix so the agent knows which assistive technologies are supported and tested.

2. For WCAG compliance audits, provide the URL or component code and the scope (single page, workflow, or whole product). The agent will identify violations with severity and cite specific WCAG criteria.

3. For content review, paste the copy (marketing, UI labels, documentation, error messages). The agent will check for plain language, inclusive terminology and clear information architecture using your tone and content guidelines.

4. For assistive-technology testing, describe the feature and the target assistive technology (screen reader, voice control, mobile AT). The agent will simulate testing and report what the user would experience.

5. Test with three workflows before going live: (a) a WCAG audit that identifies at least one contrast issue and recommends a specific color change, (b) a plain-language review that simplifies technical copy to 8th-grade reading level, (c) an assistive-tech testing report for a form that identifies keyboard and screen-reader completeness.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| WCAG reference (read) | Compliance audit | Yes |
| Issue tracking system | Defect reporting | No |
| Plain language guidelines | Content review | Yes |
| Content and terminology audit | Inclusive language review | Yes |
| Assistive tech testing matrix | AT test planning | No |
