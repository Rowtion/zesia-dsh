# Zesia dsh plugin

Start with git status. This repository is only the DeepSeek Harness integration: reply button, fixed prompt, model-facing consult tool and A2A client. Keep cloud runtime, expert profiles and execution services in their own repositories.

Preserve user changes. Never commit tokens, model keys, conversations, runtime captures or local configuration. Default credentials are in ~/.config/zesia/dsh.json, outside this repository.

Build: npm ci --ignore-scripts; npm run build. Tests: npm test. Commit lib/ because dsh installs must not require a build hook. Never bundle React: the host browser module loader supplies it. Browser code cannot read tokens; only the host tool reads credentials.

The button submits a fixed consultation prompt into the selected session. The host Agent assembles context and invokes zesia_consult; do not claim this is a deterministic direct consultation. Preserve advisory boundaries, cancellation, bounded input and no-redirect credential handling. Validate API changes against the installed dsh version and official SDK.

Publication: see README.md. CI and releases are independent of zesia-os; shared wire constants come from the pinned public @zesia/client package.
