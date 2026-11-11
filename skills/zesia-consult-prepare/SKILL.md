---
name: zesia-consult-prepare
description: Prepare a scoped, source-linked 则灵 consultation packet for the current task and response.
---

# zesia-consult-prepare

Prepare the current decision for 则灵; do not hand off ownership of the user's task.

1. Identify the user's goal, the exact question and response to review, current approach, failed attempts and unresolved issue. Preserve explicit user constraints; keep agent inferences separate.
2. Build `context.statements`: stable id, kind, origin, text, sourceRef and sourceQuote. Copy user quotes exactly. Use actual visible message IDs or tool-result references; say `unavailable` when absent. Leave duplicated legacy facts/constraints/assumptions empty. Confirmation is permission to transmit, not verification of facts.
3. Select necessary original evidence. For engineering use `references/evidence.md`; other domains need the actual experiment, data definitions, units, methods or source passages relevant to this decision. Do not force Git fields onto non-code tasks. A local path/URL is only a locator: include the excerpt itself for the cloud. Preserve errors, numbers and code verbatim; label summaries as summaries. Use the tool's `evidenceFiles` option for bounded, deterministic local-file excerpts when available. Never send credentials, unrelated files, full chat history or hidden reasoning.
4. Call `zesia_consult` once with the brief, user project and context. For a document, deck or artifact review set `requireMaterials: true`. Inline excerpts go in `context.materials`; never use top-level `materials`. Default mode creates a card: finish briefly and wait for the user to send. No preview file, self-approval, mode changes, handshakes or budget-probing retries. Automatic mode is handled by the plugin.
5. On response, load `zesia-consult-evidence` for evidence requests, `zesia-consult-decision` for user choices or unclassified clarification, and `zesia-consult-adopt` for checking usable advice. A cloud question grants no new local execution permission.
