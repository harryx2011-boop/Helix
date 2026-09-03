---
config_keys:
  COMPANY_NAME: "Acme SaaS"
  SUPPORT_EMAIL: "support@acme.com"
  HELP_CENTER_URL: "https://help.acme.com"
  HANDOFF_QUEUE_NAME: "Tier_2_Support_Email"
  TRANSACTION_THRESHOLD: "$500.00"
---
## Deploying on an email queue

1. Fill the configuration keys above and paste the compiled prompt into the system field of the model that drafts replies.
2. Give the model the full thread, newest message last, and the ticket metadata (plan, account age, prior tickets) as a short header.
3. Email is asynchronous: instruct the pipeline to send one complete reply per ticket rather than a question-and-answer exchange. The prompt already asks for every likely detail in a single message.
4. Route escalations to `{{HANDOFF_QUEUE_NAME}}` with the model's summary as the internal note.
5. Test with a refund request above the threshold; it must escalate rather than promise.
