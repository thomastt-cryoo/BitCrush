import * as original from './processing-original.mjs';

const processors = Object.freeze({
  adjustments: original.adjustments,
  postProcessing: original.postProcessing,
  tint: original.tint,
  epsilonGlow: original.epsilonGlow,
  jpegGlitch: original.jpegGlitch,
  chromaticEffects: original.chromaticEffects,
  temporalVariation: original.temporalVariation,
  halftone: original.halftoneWorkerOnly,
});

export async function processPixels({ width, height, buffer, effects = [], time }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 100_000_000) {
    throw new Error('Invalid image dimensions');
  }
  const pixels = new Uint8ClampedArray(buffer);
  if (pixels.length !== width * height * 4) throw new Error('Image pixel count does not match dimensions');
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Image processing is unavailable in this WebView');
  const imageData = new ImageData(pixels, width, height);
  ctx.putImageData(imageData, 0, 0);
  let context = { canvas, ctx, imageData, width, height, time };
  for (const effect of effects) {
    if (!effect || !effect.enabled) continue;
    if (effect.id === 'dither') {
      if (effect.params?.style === 'none') continue;
      throw new Error('The original dithering engine has not yet been ported to this runtime.');
    }
    const process = processors[effect.id];
    if (!process) throw new Error(`Unknown effect: ${effect.id}`);
    // The original worker draws the previous canvas into a fresh canvas for
    // every active stage. Preserve that boundary, including alpha rounding.
    const stageCanvas = new OffscreenCanvas(context.width, context.height);
    const stageCtx = stageCanvas.getContext('2d', { willReadFrequently: true });
    if (!stageCtx) throw new Error('Image processing is unavailable in this WebView');
    stageCtx.drawImage(context.canvas, 0, 0);
    context = { canvas: stageCanvas, ctx: stageCtx, imageData: stageCtx.getImageData(0, 0, context.width, context.height), width: context.width, height: context.height, time };
    context = await process(context, effect.params);
    context.imageData = context.ctx.getImageData(0, 0, context.width, context.height);
  }
  // The supplied renderer worker returns PNG, which its caller decodes back to
  // pixels. Keep this boundary so translucent pixels receive the same rounding.
  const blob = await context.canvas.convertToBlob({ type: 'image/png' });
  const bitmap = await createImageBitmap(blob);
  const output = new OffscreenCanvas(context.width, context.height);
  const outputCtx = output.getContext('2d');
  if (!outputCtx) { bitmap.close(); throw new Error('Image processing is unavailable in this WebView'); }
  outputCtx.drawImage(bitmap, 0, 0); bitmap.close();
  return { width: context.width, height: context.height, buffer: outputCtx.getImageData(0, 0, context.width, context.height).data.buffer };
}

self.addEventListener('message', async ({ data }) => {
  if (data?.type !== 'process') return;
  try {
    const result = await processPixels(data);
    self.postMessage({ type: 'result', requestId: data.requestId, ...result }, [result.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', requestId: data.requestId, error: error instanceof Error ? error.message : String(error) });
  }
});
self.postMessage({ type: 'ready', effects: Object.keys(processors) });
