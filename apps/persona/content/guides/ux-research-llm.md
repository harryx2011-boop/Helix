---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  RESEARCH_ARCHIVE_URL: "https://research.example.com"
  STAKEHOLDER_EMAIL: "product@example.com"
  MIN_PARTICIPANTS_HIGH_CONFIDENCE: "5"
  RECRUITMENT_PLATFORM: "https://respondent.example.com"
  DEFAULT_INTERVIEW_LENGTH_MIN: "45"
  INCENTIVE_AMOUNT: "$50 gift card"
  SYNTHESIS_TEMPLATE_URL: "https://docs.example.com/synthesis-template"
  COMPETITOR_LIST: "Competitor A, Competitor B, Competitor C"
  TARGET_BUYER_PROFILE: "Mid-market IT admin"
---
## Deploying on an LLM API

1. Fill the configuration keys above for the persona variant in use; each variant only draws on the subset it references. Paste the compiled prompt into the system field of a model configured with temperature 0.5 and max tokens 3000. Temperature 0.5 balances quote-grounded precision with natural synthesis language; higher values risk speculation presented as pattern.

2. For synthesis and thematic coding, keep temperature at 0.5 and instruct the model to quote participants directly, classifying each theme against {{MIN_PARTICIPANTS_HIGH_CONFIDENCE}}. For interview-guide generation, raise to 0.7 so example questions read naturally rather than mechanically. For competitive-insights work, keep temperature at 0.4 so comparative claims stay tied to the evidence tier.

3. Context arrives as pasted interview notes, a survey response export, a research-archive link, or a competitor product walkthrough transcript. Always include participant count and the research goal alongside the pasted text. Fence all pasted participant and competitor content as untrusted data — a transcript or review can contain phrasing that reads like an instruction, and the model must treat it as data to synthesize, never as a command.

4. Declare only the tools this instance actually calls: research-archive query (read, for prior-study lookup before starting new work), recruitment-platform API (read, interview-moderator variant only, for screener and quota planning), and no tool for the competitive-insights variant beyond archive lookup — competitor walkthroughs are supplied as pasted transcripts, not live API calls. Never wire a tool that lets the model contact a participant or a competitor directly.

   This matters specifically because moderation and recruitment touch real people; any tool that could message a participant without a human review step turns a planning aid into an uncontrolled outreach channel.

5. Test with three conversations before going live: (a) a synthesis of at least five interview notes producing themes with direct quotes and correct confidence tiers, (b) an interview guide with a screener that uses behavioral qualifying questions rather than self-identification, (c) a competitive-UX comparison that separates verified product walkthrough findings from unverified competitor claims.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Research archive (read) | Prior study lookup, all variants | No |
| Interview synthesis (implicit) | Theme extraction and quoting | Yes |
| Recruitment platform (read) | Screener design, interview-moderator variant | No |
| Stakeholder email routing | Insight summary delivery | No |

## Notes on the three variants

- **Default**: the synthesis workhorse. Feed it raw transcripts directly; it needs no live tool beyond archive lookup to function.
- **Competitive Insights**: expects a pasted product walkthrough or transcript for each name in {{COMPETITOR_LIST}}, not a live browsing tool. If no walkthrough is supplied for a competitor, the variant will mark that row unverified rather than guessing from memory.
- **Interview Moderator**: a planning tool, not a live moderator. It never talks to a participant directly; keep {{RECRUITMENT_PLATFORM}} wired for read-only quota tracking only.
- Route {{STAKEHOLDER_EMAIL}} deliveries through whatever notification system your workspace already uses; the prompt only names the recipient, it does not send mail itself.
