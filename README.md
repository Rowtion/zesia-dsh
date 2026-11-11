# ZESIA for DeepSeek Harness

Get an independent second opinion from your current conversation.

1. Select the ZESIA icon under a reply.
2. Review the prepared context and confirm before sending (default).
3. Read the advice in the conversation and decide what to use.

A trial activation code is required to consult. Manage confirmation in DeepSeek Harness settings.

[Installation guide](https://zesia.dev/install.md)

## Independent development and releases

Run `npm ci --ignore-scripts`, `npm run build`, `npm test`, `npm run package`. Public installation archives are generated here and include the client and third-party licenses. They require no private platform checkout, SDK build or administrator privileges. The official A2A transport remains intact; the shared client supplies the wire contract without replacing the DSH runtime. Native-host tests are skipped when DeepSeek Harness is unavailable; passing offline CI does not certify a host version.

Release is an explicit manual workflow on main. Archives, checksums and source metadata are attached to versioned GitHub releases; the Zesia website may mirror verified archives. Configuration and trial tokens remain local and are never included in releases.
