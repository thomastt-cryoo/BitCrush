# BitCrush Studio viewport correction — 26 October 2026

The application remains Electron-only with the approved Studio design and exact original dither/halftone engines. Original Downloads files, the existing user package and default live dist were left untouched. Local work used an isolated build and an existing FFmpeg binary; no FFmpeg was downloaded locally.

## Implemented

The supplied recording exposed issues missed by the preceding media-UI checks: native video and image-animation views did not receive the image zoom bridge, leaving footer zoom callbacks without an active controller. Canvas padding and retained viewport margins left a gap below the timeline; the processed frame also reserved 94px at the bottom inside an already-sized display area.

- Native video and image-animation previews now register real zoom actions with the existing footer and use the original zoom step, limits and scroll-zoom preference. Buttons, wheel, +/-/0 keys, drag panning and Fit reset affect the displayed media. Zoom does not change playback time, source frames, processing or exported dimensions.
- Source and processed previews share one fitted transform area. Export/progress overlays remain unscaled. The obsolete processed-overlay bottom inset is removed.
- The timeline docks directly above the footer; motion-canvas padding/margins are removed and its default height is 144px. Original transport and layer callbacks remain in place.
- Studio halftone dialogs, animation fields, dark/light styling, visible play icon, Original colors/default import, inspector visibility, native import/audio/export/recovery fixes and all 73 placeholder removals remain integrated. Preset images are preserved.

## Verified

Implementation `7a0205871ca5cc227054ad3a1bd527b340b89c77` passed every job in [CI40388756578](https://github.com/thomastt-cryoo/BitCrush/actions/runs/40388756578). Windows x64, Intel Mac and actual Apple Silicon hardware each passed:

- Eight focused media checks in source AND copied app. These measure actual rendered zoom size, exercise real mouse-wheel input, buttons/keyboard/pan/Fit, retain paused time, align original/processed rectangles and assert less than 2px timeline/footer gap at 1440x960 and 1920x1080. They also cover animation zoom, playback, layer editing/move/resize/delete, selector keys, compact/light layout and edited export decode.
- 18 existing engine/workflow checks, four color checks and seven native-video checks in source AND copied app; five design checks; source/copied extraction-worker checks.
- Both Mac deep/strict ad-hoc signatures and the corresponding codec-source job.

The old isolated build failed the new zoom geometry check (width remained 814px). The corrected local Windows build passed all eight media checks and 18 existing workflows. This closes the specific test gap; bounded fixture passes do not establish exhaustive parity.

All three downloaded ZIPs passed digest/integrity, CPU, current-code, exact-engine/codec and source/copied report verification. Final packaged wide/docked and zoomed-processed screenshots were reviewed on Windows and both Macs.

## Current packages

Earlier `electron-media-ui` and video-fix packages are preserved but superseded for this correction.

- Windows: `artifacts/github/electron-video-zoom-windows/BitCrush-Windows-Electron.zip` — 157722201 bytes; SHA256 `b6f90ddbd9dee132fe2934c7c114258bfd2b83f598923a02000627faf991f145`.
- Intel Mac: `artifacts/github/electron-video-zoom-intel/BitCrush-Mac-Intel-Electron.zip` — 133961939 bytes; SHA256 `452a1028761281d2dc229bb71d4cf8447f2c91569a262e4ade2256be981d2585`.
- Apple Silicon: `artifacts/github/electron-video-zoom-arm/BitCrush-Mac-Apple-Silicon-Electron.zip` — 126954776 bytes; SHA256 `650c2d13b8d14e0eeccfe97273d38119b393f69413d16b9c7286b360d70b5868`.

Reports and screenshots are beside each ZIP, including `package-verification.json`, `media-ui/validation-source.json`, `validation-packaged.json`, `video-docked-wide.png` and `video-zoom-processed.png`. Preserve the existing codec corresponding-source corpus at `artifacts/github/electron-run12-codec/ffmpeg-core-0.12.10-sources.zip` and notices with distribution.

## Unfinished customer release

These remain development previews. [RELEASE-READINESS.md](RELEASE-READINESS.md) tracks recorded dependency advisories, signing/installers, Developer ID/Mac notarization, native-binary/source pinning/licensing, clean-machine and broader media/parameter/accessibility QA. The legacy animated-GIF viewer is separate from the native-video/image-animation zoom paths covered here.

The earlier Windows hang cause remains unproven. Current source/copied CI passes, but large/long/VFR/HDR/rotated/multistream and arbitrary-codec combinations remain outside these fixtures. No release, installer publication, deployment or merge was performed.
