# Standalone V8 feasibility experiment

This is an isolated probe, not a production processing engine. It tests whether an embedder can load the known original processing payload and match the captured original results without shipping Electron or changing an algorithm.

Rusty V8 146.9.0 embeds V8 14.6.202.24; the original engine used Electron's 14.6.202.33. Strict and standard Bytenode-style flag normalization are attempted first. Separately labeled experimental modes normalize host/version header fields only. The original `.jsc` file and bytecode payload remain unchanged; its known SHA-256 is checked. Any cache rejection, abort, missing API or output mismatch is a failure, not a successful migration.

Run each mode as a separate bounded process because V8 can abort on incompatible snapshots:

```
cargo build --release
target/release/bitcrush-native-v8-probe strict
target/release/bitcrush-native-v8-probe flags
target/release/bitcrush-native-v8-probe host
target/release/bitcrush-native-v8-probe magic
```

A successful result is still only default-parameter fixture coverage. Broader parameter, image, architecture, size and end-to-end Tauri checks are required before integrating a host.
