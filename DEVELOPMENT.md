# Development

This repository contains only the DeepSeek Harness client integration. Cloud runtime, expert profiles and platform state are maintained separately.

Use Node >=22. Run `npm ci --ignore-scripts`, `npm run build`, `npm test`, `npm run package`.
The build commits prebuilt `lib/` so DSH does not need a build hook. React is supplied by the host browser loader and must not be bundled.

For local host testing, add this checkout with the installed DSH plugin manager and restart DSH. Use your own path; no private platform checkout is needed. Native-host tests skip when DSH is unavailable. Offline CI does not validate the final painted interface or a paid consultation.

For a distribution archive, extract `zesia-dsh/` and run `node configure.mjs` in a terminal to configure a separately obtained trial token. Do not type credentials into chat. Configuration remains under `~/.config/zesia/dsh.json`; private model credentials remain in the cloud.

The current source was exported from the former private DSH history at 3f8c0601aeddd73f94c1291380e5e334d44d3c92, then updated for independent builds and releases. Old private development history is not included in this clean export. Existing historical releases retain their original provenance.
