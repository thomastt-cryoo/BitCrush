# BitCrush

An offline Tauri desktop workspace being built from the authorized Dither Boy 6.0.3 reference. The layout uses a left library, center canvas and right inspector, with black surfaces, white typography, restrained rounding and an optional light appearance.

**Development preview. The complete processing-engine migration is not finished.** See [PREVIEW-STATUS.md](PREVIEW-STATUS.md) before treating this as a replacement for the original application.

## Development

Install Node.js 24 LTS, Rust stable and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run tauri dev
```

`npm run dev` runs the same interface in a development browser. Production loads bundled local files in the desktop window; it does not open a separate browser or use a remote application server.

## Build and verification

```sh
npm run build
npx playwright install chromium
npm test
npm run tauri build
```

GitHub Actions builds native Windows x64, Intel Mac and Apple Silicon Mac previews. Each native app starts its own system WebView and verifies the local JavaScript-to-Rust bridge, Canvas, worker startup and original processing operations. An independent Intel-hosted job also cross-builds both Mac slices into one universal app, checks its signature/architectures and runs its Intel slice. Apple Silicon native runtime tests remain separate, so runner-capacity failures do not prevent producing a universal development package. Packaging checks enforce ZIP sizes below 20,000,000 bytes.

Native startup checks and UI checks do not establish complete engine equivalence. Original extracted processing code, metadata and palettes have provenance records under `src/engine/vendor` and `src/data`.

Windows previews rely on an existing WebView2 runtime. Mac previews require macOS 13.3 or newer and use ad-hoc signing; they are not Apple-notarized releases.
