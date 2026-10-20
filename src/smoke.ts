import { invoke, isTauri } from './native';
import { initialProject } from './model';
import { processImage } from './engine';
import { verifyMediaRuntime } from './media';

let started = false;
export async function desktopSmoke() {
  if (!isTauri()) return;
  const info = await invoke<{ smokeTest: boolean }>('runtime_info');
  if (!info.smokeTest || started) return;
  started = true;
  const results: Record<string, boolean> = {};
  try {
    const input = new ImageData(new Uint8ClampedArray([30, 70, 110, 255, 200, 160, 120, 255, 50, 100, 150, 255, 220, 230, 240, 255]), 2, 2);
    const project = initialProject();
    const result = await processImage(input, project);
    results.identity = result.data.every((v, i) => v === input.data[i]);
    project.adjustments.brightness = 50;
    const dark = await processImage(input, project);
    results.originalBrightness = dark.data[0] === 15 && dark.data[1] === 35 && dark.data[2] === 55 && dark.data[3] === 255;
    project.adjustments.brightness = 100;
    project.effects = [{ id: 'invert', type: 'postProcessing', name: 'Invert', enabled: true, params: { invert: true, sharpen: 0, blur: 0, hue: 0, denoise: 0, grain: 0, vignette: 0 } }];
    const inverted = await processImage(input, project);
    results.originalInvert = inverted.data[0] === 225 && inverted.data[1] === 185 && inverted.data[2] === 145;
    results.canvas2d = !!document.createElement('canvas').getContext('2d');
    results.workspace = !!document.querySelector('.workspace');
    results.noActivation = !/activate your license|license key|sign in to continue/i.test(document.body.textContent ?? '');
    const media = await verifyMediaRuntime();
    results.offlineVideoEncodeDecode = media.passed === true && media.decode.frameCount === 24;
    await invoke('complete_smoke_test', { report: { passed: Object.values(results).every(Boolean), checks: results, media: { runtime: media.runtime, checks: media.checks, decode: media.decode.metadata, audioBytes: media.decode.audioBytes, outputs: media.outputs }, engineScope: 'Original adjustments/post-processing and offline media codec. Compiled dither engine is not verified.' } });
  } catch (error) {
    await invoke('complete_smoke_test', { report: { passed: false, checks: results, error: String(error) } });
  }
}
