---
name: zesia-consult-evidence
description: Answer a specific 则灵 follow-up requesting observable local evidence, within existing permissions.
---

# zesia-consult-evidence

Use only for `followUp.requests` whose kind is `evidence`. Keep the same local consultation via `consultId`; do not start a new unrelated consultation.

Use `zesia_consult_context` if the local question references are missing. Read the exact question and whyNeeded. Gather only the missing code/callers, configuration, logs, test output or source passage. Preserve its provenance and limitations. Read-only inspection within existing permissions is appropriate; experiments, external actions and file access still require their ordinary authorization. If evidence is unavailable, report that fact rather than guess or rerun repeatedly.

Call `zesia_consult_followup` with the parent consultId and answers keyed by requestId. Supply text and sourceRef; attach original excerpts using evidenceFiles where applicable. Send only new material to the local tool: it retains the previously approved context and constructs the complete snapshot shown in the next confirmation card. The stateless cloud cannot read local files or recover prior context from contextId alone.

Default confirmation applies on every round. Do not approve the card yourself. At most three cloud rounds per local consultation, one attempt per parent response. Never retry unknown effects. On a request for user preferences, goals, risk acceptance or permission, stop and use `zesia-consult-decision`. Do not infer a decision from technical evidence.
