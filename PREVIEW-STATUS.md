# BitCrush Studio preview status — 26 October 2026

The application is Electron-only with the approved Studio interface and exact original dither/halftone engines. The original Downloads application, existing user package and default live dist were left untouched. Earlier Tauri and video-fix packages are preserved but superseded for the current UI.

## Implemented

- Enter/Exit Halftone confirmations now match Studio typography, neutral surfaces, buttons and dark/light appearances. Original messages, confirmation/cancel callbacks and mode behavior are retained.
- Video playback, time display, timeline, Add Animation button and animation bars use the same design. The play icon has a contrasting foreground. Original playback, mute, seek, frame-step, layer drag/resize and timeline-resize elements/callbacks remain authoritative.
- The animation property editor and still-image animation setup use Studio fields, preserving original values, bounds, easing/options and callbacks. Popups stay within the viewport, support close/Escape/Tab focus, and selector typing is kept away from global timeline shortcuts.
- The completed Original colors/default-import, inspector visibility, native video import/recovery, full-length audio and MP4 finalization fixes remain integrated. All 73 effect placeholders and the downloader cat are removed; preset images are preserved.

## Verified

Implementation `f5088b964632632b5c7b03748d8cbec3bf743597` passed every job in [CI40382904628](https://github.com/thomastt-cryoo/BitCrush/actions/runs/40382904628). Windows x64, Intel Mac and actual Apple Silicon hardware each passed:

- 18 original-engine/Studio workflows, four color checks and seven native-video checks in both source and copied applications.
- Six focused media-UI checks in both source and copied applications: mode confirmations, duration/FPS setup, play/pause/step/mute/seek/collapse, animation values/easing and selector keys, layer move/resize/delete, timeline resize, dark/light/compact popup layout and an edited native export that decodes successfully.
- Five design checks, source/copied extraction-worker checks, and both Mac deep/strict ad-hoc signature checks. The corresponding codec-source job passed.

The local isolated Windows build also passed six focused media checks and all 18 workflows. No FFmpeg was downloaded locally; the installed binary was copied into temporary test data. CI installs once per platform and reuses that verified binary for copied-app and media-UI checks.

All three downloaded ZIPs passed digests/integrity, CPU headers, current runtime/views/renderer hooks, exact engine hashes, exactly one unchanged codec and all included source/copied reports. Final Windows playback and both Mac editor/halftone screenshots were reviewed; dark/light/compact layouts passed the interaction checks.

## Current packages

- Windows: `artifacts/github/electron-media-ui-windows/BitCrush-Windows-Electron.zip` — 157719597 bytes; SHA256 `8660d34f841a3d6bdbbe435816865feeac9b175846a84c7ef53ffb632f2bae47`.
- Intel Mac: `artifacts/github/electron-media-ui-intel/BitCrush-Mac-Intel-Electron.zip` — 133959167 bytes; SHA256 `8265e7a28764611e27b92de5a610279534a0fe9bb8413dbfb0e7e3d4e0bcbbea`.
- Apple Silicon: `artifacts/github/electron-media-ui-arm/BitCrush-Mac-Apple-Silicon-Electron.zip` — 126951987 bytes; SHA256 `f55d97c1c7581669e5553cdafe48e52ce6777b3f6bf10ce775e2e5a742375a68`.

Reports are beside each ZIP, including `package-verification.json` and `media-ui/validation-source.json` / `validation-packaged.json`. Screenshots in `media-ui/` show the refined controls in dark, light and compact layouts. Preserve the existing corresponding-source corpus `artifacts/github/electron-run12-codec/ffmpeg-core-0.12.10-sources.zip` and notices with distribution.

## Unfinished customer release

These remain development previews. Bounded fixture passes do not establish exhaustive feature parity or customer readiness. [RELEASE-READINESS.md](RELEASE-READINESS.md) tracks recorded dependency advisories, Windows signing/installers, Developer ID signing/Mac notarization, native-binary/source pinning and licensing, clean-machine testing, broader real-media/parameter QA and accessibility.

The earlier local same-process export stall and Windows application-hang event remain cause-unproven. Extraction is off the main thread and current source/copied CI passes; no additional local installer test disturbed the user's app. Large/long/VFR/HDR/rotated/multistream and unusual-codec combinations remain outside these fixtures. No release, installer publication, deployment or merge was performed.
