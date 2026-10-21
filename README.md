# BitCrush Studio

An offline Electron desktop workspace using the approved Studio design: a left library, center canvas and right inspector, with neutral dark and light appearances and the supplied BitCrush logo.

The original renderer remains responsible for effects, documents, history, timeline and exports. The unchanged compiled engines run in Electron 41.2.1: dithering in a worker and halftone in a hidden local Chromium renderer. The visible workspace uses a sandboxed preload bridge. Settings and palette writes use a separate BitCrush application-data directory.

Tauri is abandoned. Its earlier source and reports remain for history; active build, test, packaging and CI commands use Electron. The original Downloads application remains untouched.

## Development

```sh
npm ci
npm run dev
```

The verified reference renderer is checked into `electron/vendor`. Reimport it only when needed, from the preserved reference copy:

```sh
npm run reference:import -- "C:/Users/mazin/Projects/dither-boy-redesign/reference/windows-original/resources/app.asar"
```

The importer accepts only the recorded SHA-256 and verifies packed member integrity. The build checks imported assets against their provenance before applying narrowly scoped source transforms. It fails on missing anchors or overlapping edits. Engine modules are checked independently at runtime.

## Verification and packaging

```sh
npm run build
npm test
npm run package:zip
```

`npm test` starts the real Electron application and writes a report and screenshots under `test-results`. It compares all 73 dither processors and three halftone fixtures with unchanged bytecode in the same Electron runtime, and checks actual Studio workflows. See `PREVIEW-STATUS.md` and the per-check report for current coverage and platform limits.

Set `BITCRUSH_ELECTRON` to an existing Electron 41.2.1 executable to reuse a local runtime. On this development machine the helper also recognizes the cached reference runtime. Normal installations use the exact npm-installed Electron version. No Playwright browser download is needed.

Packaging produces a full runtime folder and ZIP under `artifacts`, with engine files, offline codec, fonts, notices and validation report. The packaging command refuses to overwrite an existing output; `BITCRUSH_PACKAGE_SUFFIX` can select a fresh name. The previous 20 MB app limit is abandoned. Keep the whole extracted folder together when running the Windows app.

CI targets Windows x64, Intel Mac and Apple Silicon Mac independently. New macOS app builds and runtime tests must pass before those packages are ready. Mac packages use ad-hoc signing. Earlier Tauri/reference-probe results do not validate the new host.

The exact FFmpeg Wasm core is included once. Codec licenses are distributed with the app, and CI publishes its pinned official source/dependency corpus as a separate artifact. See `verification/codec-source/PACKAGE-README.md` for source identity and reproducibility limits.
