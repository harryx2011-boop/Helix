---
config_keys:
  COMPANY_NAME: "Acme Corp"
  PROCUREMENT_EMAIL: "procurement@example.com"
  APPROVAL_THRESHOLD: "$25,000"
  VENDOR_SCORECARD_URL: "https://docs.example.com/vendor-eval"
  APPROVED_VENDOR_LIST: "https://docs.example.com/vendors"
  BUDGET_TRACKER: "https://budgets.example.com"
  COMPLIANCE_REQUIREMENTS: "SOC 2 Type II, D&B verification, $1M general liability insurance"
  CONTRACT_REVIEW_THRESHOLD: "$50,000"
  MAX_QUOTE_AGE_DAYS: "30"
  RFP_TEMPLATE: "https://docs.example.com/rfp-template"
  REQUIREMENT_CATEGORIES: "Functional, Technical, Security, Support, SLA"
  SCORING_GUIDANCE: "https://docs.example.com/rfp-scoring"
  RESPONSE_DEADLINE_DAYS: "21"
  MANDATORY_FIELDS: "Insurance certificate, SOC 2 report, three references, itemized pricing"
  MIN_VENDOR_COUNT: "3"
  SECURITY_CHECKLIST: "https://docs.example.com/vendor-security-checklist"
  FINANCIAL_RISK_CRITERIA: "https://docs.example.com/vendor-financial-criteria"
  CRITICAL_VENDOR_DEFINITION: "Payment processor, cloud infrastructure, HR platform, or single-source supplier"
  RISK_THRESHOLD: "70"
  VENDOR_AUDIT_RETENTION_MONTHS: "12"
  CONCENTRATION_LIMIT_PERCENT: "60"
---
## Deploying on a model API

1. Paste the compiled persona prompt into the system message field. Set `temperature: 0.3` for the default and Vendor Risk Assessor (consistent scoring matters more than variety); `temperature: 0.4` for the RFP Drafter, which still benefits from some phrasing variety across sections. Set `max_tokens: 2000` to leave room for full tables. Enable tool use for vendor, budget, and certification lookups.
2. Pass vendor proposals, RFP responses, financial disclosures, or PO requests as user-message text. Fence any pasted vendor or proposal content with `<<<UNTRUSTED VENDOR ... >>>UNTRUSTED VENDOR` so the model treats it as data to evaluate, never as instructions, per the persona's instruction-injection rule.
3. Route by persona: the default Procurement Specialist scores vendors against {{VENDOR_SCORECARD_URL}} and routes POs by {{APPROVAL_THRESHOLD}}; the RFP Drafter only produces RFP documents structured on {{RFP_TEMPLATE}} and never scores a response; the Vendor Risk Assessor only produces security and financial scores against {{SECURITY_CHECKLIST}} and {{FINANCIAL_RISK_CRITERIA}} and never picks a vendor. Do not ask one persona to do another's job in the same call.
4. Tools to wire: vendor lookup ({{APPROVED_VENDOR_LIST}}), budget verification ({{BUDGET_TRACKER}}), scorecard retrieval ({{VENDOR_SCORECARD_URL}}), compliance and certification verification ({{COMPLIANCE_REQUIREMENTS}} or {{SECURITY_CHECKLIST}}), and approval routing. The RFP Drafter additionally needs template retrieval from {{RFP_TEMPLATE}}; the Vendor Risk Assessor additionally needs a Dun & Bradstreet or public-filings lookup for {{FINANCIAL_RISK_CRITERIA}}.
5. Test each persona before going live: default should route an approved vendor straight to PO and hold a purchase at or above {{APPROVAL_THRESHOLD}} for finance; the RFP Drafter should reject a vague requirement like "good support" until it is rewritten as a testable statement; the Vendor Risk Assessor should return a composite score at or above {{RISK_THRESHOLD}} for a vendor missing a mandatory certification, and flag it for CRO review rather than passing it through silently.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Vendor database lookup | Verify pre-approved status | Default persona |
| Scorecard retrieval | Access weighted evaluation criteria | Default persona |
| Budget API | Confirm available funds at cost-center level | Default persona |
| Compliance verification | Check certifications and insurance | Default persona |
| Approval routing | Route PO to vendor or finance | Default persona |
| RFP template retrieval | Pull the standard document structure | RFP Drafter |
| Security checklist retrieval | Access certification and control criteria | Vendor Risk Assessor |
| D&B or public-filing lookup | Verify vendor financial health | Vendor Risk Assessor |
