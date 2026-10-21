## Latest manual verification and continuing Mac work — 21 October 2026

The user manually confirmed Windows video import works in the reopened current build. Their app remains running and the live dist is not being rebuilt. The FFmpeg test now requires an existing binary or explicit single-install opt-in; CI performs one download per platform and reuses it for copied-app testing. Windows/Intel CI39619509047 passed the preceding video-fix code, while Apple Silicon did not acquire a runner. Final current-code CI is being prepared on Windows, Intel Mac and the alternative macos-26 Apple Silicon runner. A local same-process post-install native-export stall remains unresolved; fresh-launch native exports passed. See RELEASE-READINESS.md for exact verification limits and customer release work.

# Video import correction — 21 October 2026

The earlier packages below are superseded for video testing: their optional native FFmpeg import uses an option removed by the current downloaded binary and leaves a spinner after failure. The bundled-codec smoke checks did not cover this route. The new source fixes native import, full-length audio, recoverable import errors, Mac architecture selection and installer transfer handling. All 73 style placeholders and the FFmpeg header logo are removed; preset views are unchanged. Windows existing 18 workflows, four color checks and design check pass. Windows native import/export with audio, a 66-second audio fixture and error/retry/same-name replacement checks pass using the affected FFmpeg binary. New install/reinstall and refreshed three-platform packages are still being verified.

See RELEASE-READINESS.md for implemented, verified and unfinished work, including dependency advisories, signing/installers and notarization. Historical package hashes below identify older previews, not this correction.

# Electron Studio status

The active application is Electron 41.2.1 with the approved BitCrush Studio views. Tauri is abandoned and the original Downloads installation remains untouched. New library, inspector controls, palette selector, effect cards, processing-order editor, presets, settings and canvas chrome consume the original renderer’s controlled values and callbacks. Original graphs, history, timeline, media/export handlers and workflow-specific dialogs remain authoritative.

Color palette exposes **Original colors** first and groups the complete available palette library. Original colors uses the original renderer’s Original (`none`) style without clearing the stored palette, adjustments or other effect instances. Selecting a retained/custom palette from that mode activates the original Color Separation processor. New image/video file imports select Original colors; transforms and edits to existing media retain the chosen mode. Studio switches inspector views directly so a canceled legacy tab fade cannot leave controls invisible.

The unchanged 73-algorithm bytecode runs in a worker. Halftone runs its exact bytecode in a hidden local Chromium renderer for OffscreenCanvas. Engine hashes are checked before loading, and vendor assets are verified before narrow AST transforms. The visible renderer is sandboxed with node integration disabled. Edition status initializes locally; no activation module is distributed. Settings and palette writes use separate BitCrush data. Cat branding, About/Licenses tabs and theme galleries are removed from the displayed workspace; notices remain distribution files.

Final run **39542469388** passed every job on Windows x64, Intel Mac and Apple Silicon Mac: all 18 workflow checks and four color checks passed in both source and copied executable, every platform passed the design-state check, and both Mac signatures passed deep/strict verification. The codec corresponding-source job passed. Run: https://github.com/thomastt-cryoo/BitCrush/actions/runs/39542469388 .

The color checks verify exact original RGB pixels in default image exports, full palette category access, actual palette application, returning to source colors with custom palette/brightness/Tint retained, reapplying the custom palette, and colored video imports after a monochrome style. Inspector opacity is asserted after image round trips and video import. The existing suite covers engine oracles, raster/SVG/screens/clipboard exports, presets, effects/order, transforms/Undo, batch, palette ZIP imports, animation/video MP4 with audio, timeline sessions and preferences. These are bounded fixtures, not exhaustive media/parameter validation.

Current verified local packages:

- Windows: artifacts/BitCrush-Windows-Electron-Original-Colors-v2.zip, SHA256 be10889127f259acbfdc74f66c58d0e79e7d7e9b98a29963a1180d10d0c2ccc6.
- Intel Mac: artifacts/github/electron-original-colors-v2-intel/BitCrush-Mac-Intel-Electron.zip, SHA256 dc579d3cf9e0d80e82410f3d2a8c80fb212a86ac0574a65a3bee18bd5ddee233.
- Apple Silicon: artifacts/github/electron-original-colors-v2-arm/BitCrush-Mac-Apple-Silicon-Electron.zip, SHA256 abc7718198aa4f15f8421c7ce8e0a8e2df22f7d098c259f568069df0f24693c8.

ZIP digests/integrity, exact engines, one unchanged codec, current views and visibility CSS, Mac CPU headers and passed reports were verified. Final Mac screenshots were reviewed with visible controls. Earlier `-final`, `-Studio-UI`, and unversioned `-Original-Colors` packages are superseded. Packages include workflow/color/design reports, notices and codec-source information.

These remain development previews: Mac signing is ad-hoc, Apple notarization and installer signing are unfinished, and the compatible pinned Electron runtime/development download dependencies retain documented npm advisories. Full Electron ZIPs replace the abandoned 20 MB limit. Preserve the pinned codec source corpus and licenses with distribution.
