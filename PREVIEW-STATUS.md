# Development preview status

This is a working Tauri UI and portability preview, not the completed Dither Boy replacement.

Implemented: independent desktop window; black and white appearances; image import; original adjustments; original grayscale/CMYK halftone worker fallback; all six original post effects; ordered effect instances; compare, zoom, undo/redo; unchanged catalog of 73 styles and 79 bundled palettes; editable swatches; local look storage; BitCrush project save/open; PNG/JPEG/WebP export where the system codec is available. Video import, frame scrubbing, preview playback and original offline MP4/H.264/AAC export now use the shared frame pipeline, with progress and worker cancellation. The large codec resource is bundled once outside the architecture-specific executable slices.

The 73 original dither implementations still require a compatible portable engine. Their metadata and parameter controls are retained. Selecting an unavailable style reports an error; the application shows the original image and blocks export instead of substituting another algorithm. Halftone is the original browser worker fallback; three recorded fixtures matched the separate compiled-native halftone byte-for-byte. This is bounded verification rather than every possible parameter/image combination.

Original Dither Boy preset import/export, clip editing/timelines, animation, batch processing, SVG/CMYK screen exports, clipboard export and broader session compatibility are not complete. Video currently decodes frames into memory, so long or high-resolution clips need further memory and cancellation testing. Original GIF timing/composition behavior and browser audio extraction limitations remain. Preview playback advances processed frames and can run slower than the source frame rate. Original code and data have not been replaced with approximate algorithms to make a smaller package.

The codec is the exact supplied single-thread FFmpeg core 0.12.10. Its licenses/notices are retained, and a separate official release/dependency source artifact accompanies CI binary artifacts. See CODEC-SOURCES.txt. Browser and Windows native tests have passed MP4 encode/import with audio; macOS codec testing is still pending for this milestone.

No login, activation window, theme gallery, cat branding, About page or Licenses tab is present. Required dependency notices are distributed as a file.

Native CI reports cover the system WebView, bridge, worker and tested processing only. A green build does not certify the unresolved dither engines or missing workflows. The under-20 MB measurement applies to this preview and must be repeated for the complete application.
