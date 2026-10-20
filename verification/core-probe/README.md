# Original engine compatibility probe

This probe tests unchanged Dither Boy 6.0.3 processing bytecode in **stock Electron 41.2.1**, separate from the original application and the new Tauri app.

## Run

Use Node.js 24:

```sh
npm ci
node install-electron.cjs
npm run probe
npm run compare
```

The installer is explicit because some development environments set `ELECTRON_SKIP_BINARY_DOWNLOAD`. It clears that setting only inside the installer process. Electron's official downloader verifies the release archive against its shipped checksums. The original application executable is never launched or changed.

`assets/manifest.json` records source identities. All `.jsc` files are checked against their original SHA-256 hashes before loading. `assets/metadata.json` contains the actual 73-entry renderer metadata and default controls; its original member identity is recorded in the manifest. The local-only `prepare-assets.cjs` script produced these files and is not required in CI.

The runner launches stock Electron in three contexts: a Node subprocess, a real Electron main process with no window, and a hidden Electron renderer with actual browser canvas APIs. All are hidden on Windows, bounded by a 45-second timeout, and use only this probe directory for Electron user data. It loads the core registry and halftone modules directly, records actual exports, and tries all 73 algorithms plus three halftone configurations with the original processing contract. The compiled halftone engine requires browser canvas APIs; Node/main failures due to missing OffscreenCanvas are retained in their reports.

`reports/` contains per-mode JSON and a platform summary. A nonzero exit signals that neither mode passed the complete probe; logs and reports should still be uploaded with `if: always()` in CI.

## Meaning of a pass

A probe pass establishes that these unchanged bytecode modules load and return valid RGBA output for these inputs/default parameters on the reported runtime and architecture. The separate `compare` command checks72 deterministic algorithm hashes and3 compiled halftone hashes against `assets/windows-baseline.json`. The single algorithm marked non-deterministic by the original metadata is excluded from exact-hash comparison but still must return valid output in the probe.

It does **not** make `.jsc` executable in Tauri's WebView, prove all parameter combinations, recover engine source, or establish a final application package size. Bytecode portability is distinct from Tauri integration.

No activation/licensing modules or installed user preferences are loaded. The probe does not patch binary headers, bytecode, Electron fuses, or the original executable.
