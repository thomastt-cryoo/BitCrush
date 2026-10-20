import { test, expect } from '@playwright/test';
import reference from '../verification/reference-results/preset-semantics-verification.json' with { type: 'json' };
import alphaReference from '../verification/reference-results/preset-alpha-semantics-verification.json' with { type: 'json' };

for (const transparent of [false, true]) test(`shared frame pipeline matches original worker with ${transparent ? 'partial alpha' : 'opaque pixels'}`, async ({ page }) => {
  await page.goto('/');
  const actual = await page.evaluate(async transparent => {
    const enginePath = '/src/engine.ts';
    const mappingPath = '/src/engine/vendor/pipeline-original.mjs';
    const { processPipeline, defaults } = await import(enginePath);
    const { buildOriginalPipeline } = await import(mappingPath);
    const width = 64, height = 48, pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = (x * 7 + y * 11) % 256; pixels[i + 1] = (x * 13 + y * 3) % 256;
      pixels[i + 2] = (x * 5 + y * 17) % 256; pixels[i + 3] = transparent ? [0, 51, 127, 204, 255][(x + y) % 5] : 255;
    }
    const hash = async (data: Uint8ClampedArray<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
    const run = async (instances: any, order: string[], settings: any = {}, time?: number) => {
      const effects = buildOriginalPipeline({ ...defaults, ...settings }, instances, order);
      const output = await processPipeline(new ImageData(pixels.slice(), width, height), effects, time);
      return hash(output.data);
    };
    const post = { type: 'postProcessing', settings: { enabled: true, ...defaults.postProcessing, invert: true } };
    const tint = { type: 'tint', settings: { ...defaults.tint, enabled: true, color: '#da682f', blendMode: 'multiply', opacity: 67 } };
    const hashes: Record<string, string> = { input: await hash(pixels) };
    hashes.singleInvert = await run({ 'post-processing-1': post }, ['post-processing-1']);
    hashes.duplicateInvert = await run({ 'post-processing-1': post }, ['post-processing-1', 'post-processing-1']);
    hashes.distinctInvertInstances = await run({ 'post-processing-1': post, 'post-processing-2': post }, ['post-processing-1', 'post-processing-2']);
    hashes.postThenTint = await run({ 'post-processing-1': post, 'tint-1': tint }, ['post-processing-1', 'tint-1']);
    hashes.tintThenPost = await run({ 'post-processing-1': post, 'tint-1': tint }, ['tint-1', 'post-processing-1']);
    hashes.hiddenEnabled = await run({ 'post-processing-1': { ...post, settings: { ...post.settings, visible: false } } }, ['post-processing-1']);
    hashes.disabled = await run({ 'post-processing-1': { ...post, settings: { ...post.settings, enabled: false } } }, ['post-processing-1']);
    hashes.outsideOrder = await run({ 'post-processing-1': post }, []);
    hashes.missingReferenceFallback = await run({}, ['post-processing-2'], { postProcessing: post.settings });
    hashes.typeMismatch = await run({ 'post-processing-1': { ...post, type: 'adjustments' } }, ['post-processing-1']);
    const half = { ...defaults.halftone, enabled: true, supersample: 4 };
    hashes.halftoneDisabledDither = await run({ 'dither-style': { type: 'dither', settings: { enabled: false, style: 'none' } } }, ['dither-style'], { halftone: half });
    hashes.halftoneWithoutDitherSlot = await run({}, [], { halftone: half });
    hashes.standaloneHalftoneId = await run({ halftone: { type: 'halftone', settings: half } }, ['halftone'], { halftone: half });
    const temporal = { type: 'temporalVariation', settings: { ...defaults.temporalVariation, enabled: true, pattern: 'wave' } };
    hashes.temporalUndefinedTime = await run({ 'temporal-variation-1': temporal }, ['temporal-variation-1']);
    hashes.temporalExplicitZero = await run({ 'temporal-variation-1': temporal }, ['temporal-variation-1'], {}, 0);
    return hashes;
  }, transparent);
  expect(actual).toEqual((transparent ? alphaReference : reference).hashes);
});
