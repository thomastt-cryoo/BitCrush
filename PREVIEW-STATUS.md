# Electron Studio preview status — 21 October 2026

The current application is Electron-only. It retains the approved BitCrush Studio interface, the exact original dither/halftone engines and the completed Original colors/default-import and inspector-visibility fixes. Tauri is abandoned. The original Downloads application and the user's running source build were left untouched during final CI and packaging.

## Implemented

- Native import supports the current FFmpeg frame-sync option, header-only probing, validated frame extraction and complete audio extraction. Native failures fall back to the bundled codec; invalid files exit loading and expose retry/choose-another-file controls. A valid replacement can share the failed filename.
- Native installation uses architecture-specific Windows/Intel/ARM downloads, verifies the staged executable before replacement and performs ZIP decompression in a worker. Progress, downloads and commands are bounded; concurrent installation is guarded.
- Export uses the original four-worker pool with bounded frame tasks and software readback for native PNGs. Original-mode preview remains visible after export. Native MP4 finalization uses faststart with zero video start.
- All 73 effect/style thumbnail placeholders are removed. The Video Engine downloader header is text only. Preset images and presentation are preserved.

## Verified

The user manually confirmed Windows video import in their reopened build.

Final implementation `d5dde4f9649c09b24731c4df4d8851bb4cfe9c2d` passed every job in [CI39627680072](https://github.com/thomastt-cryoo/BitCrush/actions/runs/39627680072). Windows x64, Intel Mac and actual Apple Silicon hardware each passed:

- 18 original-engine/Studio workflow checks and four color checks in both source and copied applications.
- Five design/settings checks, plus source/copied extraction-worker responsiveness checks without another download.
- Seven native-video checks in both source and copied applications: one fresh installation, current FFmpeg import/scrubbing, presented and seeked export pixels/audio, 66-second complete audio/frame extraction, invalid import/retry and same-name replacement. The copied app reused the verified binary. No reinstall loop is performed.
- Both Mac apps passed deep/strict ad-hoc signature verification. The corresponding codec-source job passed.

The export check waits for a real Chromium-presented frame before reading pixels. Diagnostic imported PNGs, processed PNGs and native-decoded MP4 frames contained correct colors; the earlier claim that all exported frames were black was incorrect. Native finalized output corrects the fragmented file's initial timestamp offset. The final copied-app reports verify colored first and middle frames with first-frame time zero.

Downloaded wrappers/package digests, ZIP integrity, CPU headers, current runtime/views, unchanged engines, exactly one unchanged codec and included source/copied reports all passed local verification. Final Windows and both Mac screenshots were reviewed with visible colored video and inspector controls; effect rows contain names only.

## Verified local packages

These supersede earlier Original-Colors, unversioned video-fix and historical Tauri previews for this work. Earlier files are preserved.

- Windows: `artifacts/github/electron-video-fix-v2-windows/BitCrush-Windows-Electron.zip` — 157714963 bytes; SHA256 `4261aac2a68ad56bed557b21be31531329118b101fa557fb7eae0394c2ff76ae`.
- Intel Mac: `artifacts/github/electron-video-fix-v2-intel/BitCrush-Mac-Intel-Electron.zip` — 133954324 bytes; SHA256 `46e5b716004138d8969f01d2652ec6cc16c516465f31bd6a466d75bfbaf888b2`.
- Apple Silicon Mac: `artifacts/github/electron-video-fix-v2-arm/BitCrush-Mac-Apple-Silicon-Electron.zip` — 126947105 bytes; SHA256 `9237e79e0bae2c1ed8ad80adc3df3eeb8c2ea9fcdc95d675ed10cb970e4fc3c4`.

Reports and screenshots are beside each ZIP, including `package-verification.json`, source/copied native reports and final workflow/color/design reports. Preserve the existing corresponding-source corpus at `artifacts/github/electron-run12-codec/ffmpeg-core-0.12.10-sources.zip` and notices with distribution.

## Unfinished customer-release work

These remain development previews. Fixture passes do not establish exhaustive feature parity or customer readiness. [RELEASE-READINESS.md](RELEASE-READINESS.md) tracks dependency advisories (six recorded: two high/four moderate), Windows signing/installers, Developer ID signing/Mac notarization, native-binary/source pinning and licensing, clean-machine testing, broader real-media/codec/parameter QA and accessibility. Mac ad-hoc signatures are not notarization.

A local same-process export stall and Windows application-hang event were observed earlier. ZIP extraction was moved off the main thread and final source/copied CI passes, but the precise local hang cause remains unproven; the user's active app was not disturbed for another local install test. Large/long/VFR/HDR/rotated/multistream media and arbitrary codec combinations remain outside these bounded checks.

No release, installer publication, deployment or merge was performed.
