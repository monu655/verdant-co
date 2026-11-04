# 3-minute demo plan

| Time | Show | Say |
|---|---|---|
| 0:00 | Customer view, send the address-change sample | What it is: customers message, an AI drafts, a human approves |
| 0:25 | Agent login, conversation list, open Aisha | The draft appears for the agent only |
| 0:50 | Edit the draft, Approve reply, switch to Customer view | Only approved text reaches the customer |
| 1:15 | Run the curl test: valid, repeat (duplicate), wrong signature (401) | Same intake service, raw-body HMAC, idempotent |
| 1:50 | Send "Do you deliver to Dubai?" | Not in the knowledge base: safe reply plus a "check the facts" flag |
| 2:10 | Turn the LLM off (bad key) and send a message, show the red card and Retry | Message is saved first, failure is visible, nothing faked |
| 2:35 | Key decision: save first, draft second. One improvement: alerting and a retry queue | |
