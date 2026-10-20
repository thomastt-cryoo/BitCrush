# Original browser-worker oracle

Unmodified files copied from the authorized Dither Boy 6.0.3 renderer archive:

- `imageProcessor.worker-DvXeYfV0.js`, SHA256 `e66e06a5196fb1b21923005d3f409e6b1bd11b68c3721d0d973efb3190ba76aa`
- `metadata.prod-BOBIde2r.js`, SHA256 `7dd48df6a9c2eb0da046b404b11b6cb3a5e223ee0160901d1318b4a25bfce98f`

These test-only files are served unchanged through Playwright routes; they are not included in the production bundle. The tests compare original and migrated workers in the same browser, including stage ordering, disabled/hidden stages, duplicates, halftone dispatch, undefined animation time and partial alpha. Canvas color/alpha rounding can differ across browser versions and graphics backends, so a recorded Windows hash alone cannot establish a Linux or WebKit failure.

The original browser worker does not contain the compiled dither implementations. These tests do not verify those implementations or full application equivalence.
