# Source package for the supplied @ffmpeg/core 0.12.10

This package preserves the official core release source, all sixteen source repositories named by its Dockerfile, Emscripten3.1.40 runtime/toolchain source, SDL2 source selected by that Emscripten port, their full source archives and license texts, and evidence of binary/source identity. It is separate from the application ZIP so the application can remain below20MB.

The supplied original `ffmpeg-core-CI9Irx9p.js` and `ffmpeg-core-CgUfceKH.wasm` are byte-identical to official npm `@ffmpeg/core@0.12.10` ESM files. Registry integrity and observed hashes are in `npm-comparison.json`. The core Wasm SHA256 is `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7`.

The correct official release is **v12.15**, commit `71aa99d37c02a7b4c435275ca9ef50e612f6efa1`, published January7,2025. Its package declares core0.12.10 and its release name explicitly identifies core/core-mt0.12.10. The older similarly named **v0.12.10** is wrapper0.12.10/core0.12.6 and is not the right source release.

`ffmpeg-wasm-v12.15-71aa99d.tar.gz` contains the unmodified official repository, including `Dockerfile`, `Makefile`, `build/*.sh`, complete modified `src/fftools/*.c`, `src/bind/ffmpeg/*`, wrapper sources and license. GitHub archives omit the testdata submodule; it is a test fixture rather than a linked core library. All sixteen libraries the Dockerfile clones are additionally preserved under `dependency-sources/` at exact resolved commit IDs. SHA256, official URLs and source-ref identities are in `dependency-source-manifest.json`.

The release uses these inputs:

| Component | Official release ref |
| --- | --- |
| FFmpeg | n5.1.4 |
| x264 | ffmpegwasm fork, 4-cores |
| x265 | ffmpegwasm fork, 3.4 |
| libvpx | ffmpegwasm fork, v1.13.1 |
| lame | ffmpegwasm fork, master |
| Ogg | ffmpegwasm fork, v1.3.4 |
| theora | ffmpegwasm fork, v1.1.1 |
| opus | ffmpegwasm fork, v1.3.1 |
| vorbis | ffmpegwasm fork, v1.3.3 |
| zlib | ffmpegwasm fork, v1.2.11 |
| libwebp | ffmpegwasm fork, v1.3.2 |
| freetype2 | ffmpegwasm fork, VER-2-10-4 |
| fribidi | v1.0.9 |
| harfbuzz | 5.2.0 |
| libass | 0.15.0 |
| zimg | release-3.0.5 |
| Emscripten | 3.1.40 |
| SDL2 Emscripten port | release-2.24.2 |

The only branch inputs are x2644-cores at `33cac6b77d5b9259c552156013a817ab23119612` (commit date2022-08-22) and lame master at `2badea1974ae36cb8312afe99cff1e6b3b5decee` (2020-10-29). Both currently selected tips predate the core release. `Dockerfile.pinned` replaces every dependency ref with its resolved commit to prevent future drift; it is an explicitly marked new build-input pinning change. Original Dockerfile remains in the original archive. Emscripten's SDL2 port SHA512 exactly matches the included SDL2 ZIP.

Full source archives already preserve license headers, copyright notices and build-time patches. `source-license-texts/` also exposes the main license texts directly, including GPL/LGPL/FTL/MIT/BSD notices. Freetype's alternative-license terms and zlib's source-header license are retained, rather than relying only on the original application's abbreviated dependency list.

## Building the source

Extract the official release archive. It contains the original `make prd` single-thread release recipe. `Makefile` passes FFMPEG_ST=yes and `-O3 -msimd128` to Docker Buildx using `emscripten/emsdk:3.1.40`; Docker builds every library then FFmpeg and both ESM/UMD glue outputs. Modified FFmpeg front-end source and JS bindings are copied over the upstream FFmpeg source before linking. Do not replace this modified source with an unmodified upstream FFmpeg binary.

To freeze dependency choices, copy the supplied `Dockerfile.pinned` over the extracted release's Dockerfile, retaining the change notice, then run the existing `make prd`. This recipe still obtains the same commit source trees online; the full archives in this source package make those exact sources independently available for inspection or an offline build-context adaptation. No build was executed during this bounded source-collection pass.

The source configuration matches the observed runtime's FFmpeg5.1.4, compilerEmscripten3.1.40, O3/SIMD flags, thread-disable flags and all enabled libraries. Twelve pre-JS binding function ASTs in the official release exactly match the original generated core glue after disregarding source positions/comments and equivalent shorthand syntax (`source-correspondence.json`).

## Evidence limits

This is the official release source path and a complete captured source corpus for its linked dependencies/runtime. It is **not** an independently reproduced bit-for-bit Wasm build. npm has no gitHead and the official release has no signed binary build attestation. Historical CI artifacts for the release commit were unavailable. The original builder's Docker image digest and exact versions of general Ubuntu build utilities were not recorded by the original recipe. The two branch refs are frozen from today's official tips; no signed historical branch-tip log was obtained. These are provenance/reproducibility limits, not known mismatching source code.

zimg and Emscripten repository archives name test-only googletest/other test-suite submodules; those fixtures are not included in this corpus. The original runtime build does not link those tests. `source-license-inventory.json` records the exact omitted test paths. A full development checkout that runs every upstream test may separately fetch them. The compiler's full LLVM toolchain source/container is not duplicated; Emscripten source/runtime and selected SDL source are included.

GPLv2 section3 allows equivalent source access alongside a binary download. The release publisher should make this source package accessible to the same recipients/download location, preserve the full licenses/notices, and avoid describing the Tauri app's own source repository or a generic upstream master link as the core's complete source. This audit does not decide whether the entire host app is a derivative or aggregate; it documents the actual GPL core and the captured source materials.

Official entrypoints:

- https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15
- https://github.com/ffmpegwasm/ffmpeg.wasm/tree/71aa99d37c02a7b4c435275ca9ef50e612f6efa1
- https://registry.npmjs.org/@ffmpeg/core/0.12.10
- https://ffmpeg.org/legal.html
- https://raw.githubusercontent.com/FFmpeg/FFmpeg/n5.1.4/COPYING.GPLv2
