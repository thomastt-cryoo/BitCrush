# Development preview status

This is a working Tauri UI and portability preview, not the completed Dither Boy replacement.

Implemented: independent desktop window; black and white appearances; image import; original adjustments; original grayscale/CMYK halftone worker fallback; all six original post effects; ordered effect instances; compare, zoom, undo/redo; unchanged catalog of 73 styles and 79 bundled palettes; editable swatches; local look storage; BitCrush project save/open; PNG/JPEG/WebP export where the system codec is available.

The 73 original dither implementations still require a compatible portable engine. Their metadata and parameter controls are retained. Selecting an unavailable style reports an error; the application shows the original image and blocks image export instead of substituting another algorithm. Halftone is the original browser worker fallback; equivalence to the separate compiled-native halftone engine has not been established.

Original Dither Boy preset import/export, GIF/video timelines, animation, batch processing, SVG/CMYK screen exports, clipboard export and broader session compatibility are not complete in this preview. Original code and data have not been replaced with approximate algorithms to make a smaller package.

No login, activation window, theme gallery, cat branding, About page or Licenses tab is present. Required dependency notices are distributed as a file.

Native CI reports cover the system WebView, bridge, worker and tested processing only. A green build does not certify the unresolved dither engines or missing workflows. The under-20 MB measurement applies to this preview and must be repeated for the complete application.
