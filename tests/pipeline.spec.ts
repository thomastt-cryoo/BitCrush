import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import reference from '../verification/reference-results/preset-semantics-verification.json' with { type: 'json' };

for (const transparent of [false, true]) test(`shared frame pipeline matches original worker with ${transparent ? 'partial alpha' : 'opaque pixels'}`, async ({ page }) => {
  const fixtures = new Map(await Promise.all(['imageProcessor.worker-DvXeYfV0.js', 'metadata.prod-BOBIde2r.js'].map(async name => [name, await readFile(new URL(`./fixtures/original-worker/${name}`, import.meta.url))] as const)));
  expect(createHash('sha256').update(fixtures.get('imageProcessor.worker-DvXeYfV0.js')!).digest('hex')).toBe('e66e06a5196fb1b21923005d3f409e6b1bd11b68c3721d0d973efb3190ba76aa');
  expect(createHash('sha256').update(fixtures.get('metadata.prod-BOBIde2r.js')!).digest('hex')).toBe('7dd48df6a9c2eb0da046b404b11b6cb3a5e223ee0160901d1318b4a25bfce98f');
  await page.route('**/original-oracle/*', route => {
    const body = fixtures.get(new URL(route.request().url()).pathname.split('/').at(-1)!);
    return body ? route.fulfill({ contentType: 'text/javascript', body }) : route.abort();
  });
  await page.goto('/');
  const actual = await page.evaluate(async transparent => {
    const enginePath = '/src/engine.ts';
    const mappingPath = '/src/engine/vendor/pipeline-original.mjs';
    const { processPipeline, defaults } = await import(enginePath);
    const { buildOriginalPipeline } = await import(mappingPath);
    const oracle = new Worker('/original-oracle/imageProcessor.worker-DvXeYfV0.js', { type: 'module' });
    await new Promise<void>((resolve, reject) => {
      oracle.onmessage = ({ data }) => { if (data.type === 'ready') resolve(); if (data.type === 'error') reject(Error(data.error)); };
      oracle.onerror = () => reject(Error('Original reference worker did not load'));
    });
    let requestId = 0;
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
      const id = ++requestId;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Original worker timed out')), 10000);
        oracle.onmessage = ({ data }) => {
          if (data.requestId !== id) return;
          clearTimeout(timer);
          if (data.type === 'error') reject(Error(data.error)); else resolve(data.dataUrl);
        };
        oracle.postMessage({ type: 'process', requestId: id, imageData: new ImageData(pixels.slice(), width, height), effectSettings: { ...structuredClone(defaults), dither: { enabled: false, style: 'none', scale: 45, palette: ['#000000', '#ffffff'], controls: {} }, halftone: { ...defaults.halftone, enabled: false, supersample: 4 }, ...settings }, effectInstances: instances, pipelineOrder: order, ...(time === undefined ? {} : { time }) });
      });
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const originalHash = await hash(context.getImageData(0, 0, width, height).data);
      const migratedHash = await hash(output.data);
      if (originalHash !== migratedHash) throw Error(`Original/migrated pixels differ in case ${id}: ${originalHash} / ${migratedHash}`);
      return migratedHash;
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
    oracle.terminate();
    return hashes;
  }, transparent);
  // Opaque output is stable across the recorded platforms. Alpha output also
  // passes the live oracle above; do not impose a Windows GPU hash on Linux.
  if (!transparent) expect(actual).toEqual(reference.hashes);
});
