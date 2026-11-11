---
name: zesia-consult-decision
description: Clarify user-owned choices raised by 则灵 without deciding or authorizing actions on the user behalf.
---

# zesia-consult-decision

Use for follow-up kind `user_decision`, or `clarification` whose answer is not safely observable.

Explain the decision in the user's language: what is being chosen, why it affects the recommendation, the grounded alternatives and their consequences. A reasoned recommendation is allowed; choosing for the user is not. Do not ask again if their answer is already explicitly available. Do not invent options or budget numbers.

Use the local-only `zesia_consult_context` tool with consultId to obtain current requests and actual user message references; it sends nothing to the cloud.

Wait for an explicit answer when a choice is necessary. Supply its exact quote and actual visible user message ID in `zesia_consult_followup` as sourceQuote and sourceRef for the matching requestId. The plugin verifies the quote against this session's user messages. An assistant/tool statement, confirmation-card click or permission to send is not the user's decision. If no verifiable message reference exists, explain the limitation instead of fabricating one.

Separate permission to submit advice from permission to perform the recommended action. Preserve unanswered questions as unknown. A third-round response must end with bounded advice and unresolved limits, not an unlimited dialogue.
