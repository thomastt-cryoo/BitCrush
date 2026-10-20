# Exact V8 build: bindgen toolchain correction

## Preflight correction, 21 October 2026

Run 39515076613 paired Clang/libclang 21 successfully, then stopped before Cargo because the standalone header sample lacked `_LIBCPP_HARDENING_MODE`. The pinned Chromium build at `8fbb331a68c597851e2e91de6e08a06baa3d719b`, `config/compiler/BUILD.gn`, supplies this macro through GN defines; the pinned buildtools `__config_site` intentionally does not define a default. The sample now selects Chromium's extensive mode explicitly. This changes only the standalone preflight: GN/V8 flags and bindgen's generated-GN-define path remain untouched. The report now records the sample flags and formatted libclang error diagnostics. Exact cache compatibility remains untested until the host builds and runs.

Observed run39482894060: `[2450/2450] AR obj/librusty_v8.a`, followed by `build.rs:235 Unable to generate bindings`. The diagnostic log is retained in `exact-source-diagnostics-2/build.log`. This demonstrates successful C++ compilation/archive generation, not a completed Rust host or original-cache acceptance.

The next diagnostic is explicit: `Libc++ only supports Clang 20 and later`. Errors then report unresolved stdint using-declarations (`std::uintptr_t`, uint64-related types) and missing `SIZE_MAX`. Rusty v146.9.0 `build_binding()` uses libclang independently of the downloaded Chromium C++ compiler. It adds builtin-resource headers only when `LIBCLANG_PATH/../bin/clang -print-resource-dir` works. Installing `libclang-19-dev` alone neither meets the20+ requirement nor guarantees that paired clang binary.

Correction: install `clang-21` and `libclang-21-dev` from LLVM's signed Ubuntu Noble21 repository, set `LIBCLANG_PATH=/usr/lib/llvm-21/lib`, keep GN's downloaded Chromium compiler unchanged, and run the new exact stdint/libclang preflight. [Official LLVM packages](https://apt.llvm.org/), [pinned Rusty bindgen argument generator](https://github.com/denoland/rusty_v8/blob/81a3711cacee3272cdd3c37c1526dc1cf55cd7b7/tools/get_bindgen_args.py).

Changed reference artifacts:

- `prepare-exact-v8.py` now copies the tested-by-syntax `exact-v8-ci-runtime.py` runner and adds a checked, CI-local bindgen-only recovery guard to pinned Rusty build.rs. No V8 source patch, bytecode header or runtime flag changes.
- `exact-v8-ci-runtime.py` preflights loaded libclang + paired resources, always reports failures, and checkpoints the exact own-built archive/generated metadata. A verified checkpoint permits binding-only retry instead of Ninja recompilation.
- `exact-v8-source-retry.yml` is a reviewable workflow example with explicit LLVM signing fingerprint and21 packages, conditional checkpoint restore, always-save cache/artifact, and strict/flags tests.
- `EXACT-V8-CI-RECIPE.md` records the updated evidence, correction and recovery limits.

The old job preserved only diagnostics. Without an archive artifact/cache, its vanished runner cannot be resumed. This patch prevents that loss after the next archive build; it does not claim to recover the old archive or guarantee successful cache deserialization. Local validation is limited to script parsing, pinned build.rs anchor/patch checks and checkpoint identity logic, including rejection of thin archives and changed absolute GN/workspace paths. `retry-validation.json` records eight passing local checks and explicit Linux execution limits. No large downloads, local C++/V8 build, GitHub edit or application edit was performed.

The earlier `electron-addon-audit/` package is still partial: its pins, public-addon source, compile-only accessor source, runtime/header preparers and shared ELF audit helpers exist, but the orchestrator/workflow and executable end-to-end validation are unfinished. It must not be advertised as ready to launch. This runtime-build correction takes priority.
