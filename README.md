English | [简体中文](README.zh-CN.md)

# ZESIA for DeepSeek Harness

An independent second opinion inside your existing DeepSeek Harness conversation. The native plugin adds a reply action and a review interface; the original agent keeps control of the work.

## Install

Ask your agent:

```text
Read https://zesia.dev/install.md and install Zesia for this agent.
```

For the exact repository version, use [Releases](https://github.com/Rowtion/zesia-dsh/releases) and verify its checksum. Extract into a durable user-owned directory, then provision the transport before loading the plugin:

```sh
node <plugin-directory>/lib/install-a2a.mjs
dsh plugin --profile desktop add <plugin-directory> --offline --ignore-scripts
```

Use the running host's actual profile; `web` is for a standalone Web profile. Verify the plugin listing and restart the selected host when required. Do not terminate an active session automatically. The production guide may still point to an earlier verified release.

Installation requires Node.js 22+ and ordinary host permissions, not administrator access or a private platform checkout. Official a2a-cli 0.4.0 is installed inside the plugin directory with a pinned platform SHA-256 and its license. Repeat transport setup for each newly installed version; consultations never download executables.

## Use

1. Select the ZESIA action beneath an agent reply.
2. Review the prepared question, evidence and destination; confirmation is required by default.
3. Receive the advice in the conversation and decide what to adopt.

A trial token is required for cloud consultation. Run `node <plugin-directory>/configure.mjs` in your terminal to configure it privately. Run the same command with `--show` for non-sensitive configuration status. Keep credentials out of chat and Git. Manage confirmation preferences in the host's plugin settings.

The bundled preparation, evidence, decision and adoption Skills guide the original agent. Registration does not guarantee that a model follows every instruction. Follow-ups carry a reviewed context snapshot; unknown send outcomes are never retried automatically. Advice does not authorize additional execution.

## Develop

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run package
```

The shared `@zesia/runtime` supplies official CLI transport while the DSH adapter owns native UI and host integration. Native-host checks are conditional on an installed compatible host; offline CI does not certify every host version or the final UI.

Release is an explicit workflow on `main`. Archives, checksums and exact source metadata are published together; the website may mirror verified bytes. Never overwrite a published release. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
