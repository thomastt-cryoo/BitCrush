import defaults from './engine/vendor/original-defaults.json';
import type { Project, Stage } from './types';

export { defaults };

let worker: Worker | undefined;
let serial = 0;
const waiting = new Map<number, { resolve: (data: ImageData) => void; reject: (error: Error) => void; timer: number }>();

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
  const effects: Array<{ id: string; enabled: boolean; params: Record<string, any> }> = [
    { id: 'adjustments', enabled: true, params: project.adjustments },
  ];
  if (project.mode === 'halftone') effects.push({ id: 'halftone', enabled: true, params: { ...project.halftone, enabled: true, supersample: 4 } });
  else if (project.algorithmId !== 'none') effects.push({ id: 'dither', enabled: true, params: { ...project.ditherParams, style: project.algorithmId, palette: project.palette.colors } });
  for (const stage of project.effects) effects.push({ id: stage.type, enabled: stage.enabled, params: { ...stage.params, enabled: stage.enabled } });
  return effects;
}

export function processImage(image: ImageData, project: Project, time?: number): Promise<ImageData> {
  const current = getWorker();
  const requestId = ++serial;
  const buffer = image.data.slice().buffer;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      for (const item of waiting.values()) { clearTimeout(item.timer); item.reject(new Error('Processing timed out. Try a smaller image.')); }
      waiting.clear(); worker?.terminate(); worker = undefined;
    }, 60000);
    waiting.set(requestId, { resolve, reject, timer });
    current.postMessage({ type: 'process', requestId, width: image.width, height: image.height, buffer, effects: pipeline(project), time }, [buffer]);
  });
}

export const effectNames: Record<string, string> = {
  postProcessing: 'Post processing', tint: 'Tint', epsilonGlow: 'Epsilon glow', jpegGlitch: 'JPEG glitch', chromaticEffects: 'Chromatic effects', temporalVariation: 'Temporal variation',
};
export const makeEffect = (type: string): Stage => ({
  id: crypto.randomUUID(), type, name: effectNames[type], enabled: true,
  params: structuredClone((defaults as Record<string, any>)[type]),
});
