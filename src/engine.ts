import defaults from './engine/vendor/original-defaults.json';
import { buildOriginalPipeline } from './engine/vendor/pipeline-original.mjs';
import { buildOriginalPresetPipeline } from './original-preset';
import { restoreOriginalCompatibility } from './original-project';
import type { Project, Stage } from './types';

export { defaults };

let worker: Worker | undefined;
let serial = 0;
const waiting = new Map<number, { resolve: (data: ImageData) => void; reject: (error: Error) => void; timer: number }>();

export function cancelProcessing() {
  for (const item of waiting.values()) {
    clearTimeout(item.timer);
    item.reject(new DOMException('Processing cancelled', 'AbortError'));
  }
  waiting.clear(); worker?.terminate(); worker = undefined;
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./engine/vendor/portable.worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const item = waiting.get(data.requestId);
    if (!item) return;
    clearTimeout(item.timer);
    waiting.delete(data.requestId);
    if (data.type === 'error') item.reject(new Error(data.error));
    else item.resolve(new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height));
  };
  worker.onerror = () => {
    for (const item of waiting.values()) {
      clearTimeout(item.timer);
      item.reject(new Error('The image processor could not start.'));
    }
    waiting.clear();
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}

export function pipeline(project: Project) {
  if (project.originalCompatibility) return buildOriginalPresetPipeline(restoreOriginalCompatibility(project.originalCompatibility));
  const { scaleDpi, colorDepth, luminanceThreshold, orderedCycling, ...controls } = project.ditherParams;
  const instances: Record<string, { settings: Record<string, any> }> = {
    adjustments: { settings: { ...project.adjustments, enabled: true } },
    'dither-style': { settings: {
      enabled: true, style: project.algorithmId, scale: scaleDpi,
      luminanceThreshold, colorDepth, orderedCycling, controls,
      palette: project.palette.colors.map(color => '#' + [color.r, color.g, color.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')),
    } },
  };
  const order = ['adjustments', 'dither-style'];
  const prefixes: Record<string, string> = { postProcessing: 'post-processing', tint: 'tint', epsilonGlow: 'epsilon-glow', jpegGlitch: 'jpeg-glitch', chromaticEffects: 'chromatic-effects', temporalVariation: 'temporal-variation' };
  project.effects.forEach((stage, index) => {
    const prefix = prefixes[stage.type];
    if (!prefix) throw new Error(`Unknown effect: ${stage.type}`);
    const id = `${prefix}-${index + 1}`;
    instances[id] = { settings: { ...stage.params, enabled: stage.enabled } };
    order.push(id);
  });
  return buildOriginalPipeline({ halftone: { ...project.halftone, enabled: project.mode === 'halftone', supersample: 4 } }, instances, order);
}

export function processPipeline(image: ImageData, effects: Array<{ id: string; enabled: boolean; params: Record<string, any> }>, time?: number): Promise<ImageData> {
  const current = getWorker();
  const requestId = ++serial;
  const buffer = image.data.slice().buffer;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      for (const item of waiting.values()) { clearTimeout(item.timer); item.reject(new Error('Processing timed out. Try a smaller image.')); }
      waiting.clear(); worker?.terminate(); worker = undefined;
    }, 60000);
    waiting.set(requestId, { resolve, reject, timer });
    current.postMessage({ type: 'process', requestId, width: image.width, height: image.height, buffer, effects, time }, [buffer]);
  });
}

export function processImage(image: ImageData, project: Project, time?: number): Promise<ImageData> {
  try { return processPipeline(image, pipeline(project), time); }
  catch (error) { return Promise.reject(error); }
}

export const effectNames: Record<string, string> = {
  postProcessing: 'Post processing', tint: 'Tint', epsilonGlow: 'Epsilon glow', jpegGlitch: 'JPEG glitch', chromaticEffects: 'Chromatic effects', temporalVariation: 'Temporal variation',
};
export const makeEffect = (type: string): Stage => ({
  id: crypto.randomUUID(), type, name: effectNames[type], enabled: true,
  params: structuredClone((defaults as Record<string, any>)[type]),
});
