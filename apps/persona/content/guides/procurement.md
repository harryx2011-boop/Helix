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
## Deploying in your procurement workflow

1. Fill the configuration keys above. The wizard substitutes them into each persona's compiled prompt; the RFP Drafter and Vendor Risk Assessor personas use additional keys beyond the default's, so complete all of them once and every persona in this role stays in sync.
2. Paste the compiled prompt into the system field of your procurement tool: an email AI, a chat platform sitting in front of the procurement inbox, or a document assistant wired into your RFP builder.
3. Provide context with every request: for vendor evaluation, the business case, budget and required capabilities; for a purchase order, the vendor name, contract value and cost-center code; for an RFP, the must-have versus nice-to-have requirement split; for a risk assessment, the vendor's access scope and how critical the function is.
4. Wire the approval chain to match the thresholds you configured: purchase orders below {{APPROVAL_THRESHOLD}} route straight to the vendor; at or above it, to finance. Contracts at or above {{CONTRACT_REVIEW_THRESHOLD}} go to legal. Vendor risk scores at or above {{RISK_THRESHOLD}} go to the CRO.
5. Test with three cases before going live: a pre-approved vendor purchase under {{APPROVAL_THRESHOLD}} (should issue a PO directly, no escalation), a new vendor missing a required certification (should be flagged, not silently scored as compliant), and a purchase at or above {{APPROVAL_THRESHOLD}} (should hold for finance sign-off, not issue). All three must follow the documented workflow, not a shortcut, before you trust it with real spend.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Vendor lookup | Check the approved-vendor list | Yes |
| Budget verification | Confirm funds at the cost-center level | Yes |
| Scorecard retrieval | Access weighted evaluation criteria | Yes |
| Compliance check | Verify certifications and insurance | Yes |
| Approval routing | Send POs to finance or the vendor | Yes |
| RFP template retrieval | Pull the standard document structure | RFP Drafter only |
| D&B or public-filing lookup | Verify vendor financial health | Vendor Risk Assessor only |
