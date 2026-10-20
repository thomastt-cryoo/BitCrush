import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

function fixture() {
  const instance = (id: string, type: string, settings: any) => ({ type, instanceId: id, label: id, settings, isOriginal: id.endsWith('-1'), isDuplicatable: true, extension: { keep: true } });
  return { type: 'dither-boy-preset', version: '6.0.3', exportedAt: 11, exportedBy: 'Dither Boy 6.0.3', futureEnvelope: { keep: 'yes' }, preset: {
    id: 'original-project-fixture', name: 'Original fixture', createdAt: 1, updatedAt: 2, version: '6.0.3',
    colorPalette: { category: 'Monochrome', paletteId: 'monochrome-grayscale', customColors: ['#AbCdEf', '#FFFFFF'], colorDepth: 8, orderedCycling: false, futurePalette: 7 },
    dither: { category: 'all', style: 'none', scale: 45, luminanceThreshold: 50, controls: {} },
    effectInstances: {
      adjustments: instance('adjustments', 'adjustments', { enabled: false, brightness: 123, contrast: 100, saturation: 100, midtones: 50, highlights: 50, blur: 0, denoise: 0, hue: 0, futureAdjustments: { keep: 1 } }),
      'adjustments-2': instance('adjustments-2', 'adjustments', { enabled: true, brightness: 77, contrast: 100, saturation: 100, midtones: 50, highlights: 50, blur: 0, denoise: 0, hue: 0 }),
      'dither-style': instance('dither-style', 'dither', { enabled: false, style: 'none', category: 'all', scale: 45, luminanceThreshold: 50, colorDepth: 8, orderedCycling: false, palette: ['#AbCdEf', '#FFFFFF'], controls: { future: 17 } }),
      'post-processing-1': instance('post-processing-1', 'postProcessing', { enabled: true, visible: false, invert: true, sharpen: 0, blur: 0, hue: 0, futurePost: { keep: 42 } }),
      'tint-1': instance('tint-1', 'tint', { enabled: true, color: '#e7612c', blendMode: 'multiply', opacity: 60 }),
      'jpeg-glitch-1': instance('jpeg-glitch-1', 'jpegGlitch', { enabled: false, blockShift: { enabled: false, amount: 0, futureNested: 'retain' } }),
    },
    pipelineOrder: ['post-processing-1', 'adjustments', 'tint-1', 'dither-style', 'adjustments-2'],
    animationExtension: { layers: [{ propertyPath: 'tint.opacity', fromValue: 0, toValue: 70 }], fps: 30 },
  } };
}

test('canonical project survives JSON storage without flat normalization or identity loss', async ({ page }) => {
  const text = '\n' + JSON.stringify(fixture(), null, '\t') + '\n'; await page.goto('/');
  const actual = await page.evaluate(async text => {
    const a = '/src/original-project.ts', b = '/src/original-preset.ts', c = '/src/model.ts', d = '/src/engine.ts';
    const api = await import(a), docs = await import(b), model = await import(c), engine = await import(d);
    const project = api.projectFromOriginalPreset(docs.parseOriginalPreset(text));
    const restored = model.validateProject(JSON.parse(JSON.stringify(project)));
    return { output: api.exportOriginalProject(restored), pipeline: engine.pipeline(restored), project, capabilities: api.originalProjectCapabilities(restored) };
  }, text);
  expect(actual.output).toBe(text);
  expect(actual.project.effects.map((stage: any) => stage.id)).toEqual(['post-processing-1', 'tint-1']);
  expect(actual.project.adjustments.brightness).toBe(123); expect(actual.project.adjustments).not.toHaveProperty('enabled');
  expect(actual.pipeline.map((stage: any) => [stage.id, stage.enabled])).toEqual([['postProcessing', true], ['adjustments', false], ['tint', true], ['dither', false], ['adjustments', true]]);
  expect(actual.capabilities.duplicateBaseStages).toBe(true); expect(actual.capabilities.inactiveInstances).toBe(1); expect(actual.capabilities.canProcess).toBe(true);
});

test('selected edits patch only targeted paths and preserve palette spelling and inactive state', async ({ page }) => {
  await page.goto('/');
  const actual = await page.evaluate(async input => {
    const a = '/src/original-project.ts', b = '/src/original-preset.ts'; const api = await import(a), docs = await import(b);
    const project = api.projectFromOriginalPreset(docs.parseOriginalPreset(JSON.stringify(input)));
    const next = structuredClone(project); next.adjustments.brightness = 150; next.ditherParams.scaleDpi = 33;
    next.effects[0].params.sharpen = 27; next.palette.colors[1] = { r: 10, g: 20, b: 30 };
    const edited = api.commitOriginalProjectEdit(project, next);
    const direct = api.editOriginalProjectInstance(edited, 'adjustments-2', ['brightness'], 80);
    return { raw: direct.originalCompatibility.envelope, before: project.originalCompatibility.envelope };
  }, fixture());
  const raw = actual.raw.preset;
  expect(actual.before).toEqual(fixture());
  expect(raw.effectInstances.adjustments.settings).toMatchObject({ enabled: false, brightness: 150, futureAdjustments: { keep: 1 } });
  expect(raw.effectInstances['adjustments-2'].settings.brightness).toBe(80);
  expect(raw.effectInstances['post-processing-1'].settings).toMatchObject({ visible: false, sharpen: 27, futurePost: { keep: 42 } });
  expect(raw.effectInstances['dither-style'].settings.scale).toBe(33); expect(raw.dither.scale).toBe(33);
  expect(raw.colorPalette.customColors).toEqual(['#AbCdEf', '#0a141e']); expect(raw.pipelineOrder).toEqual(fixture().preset.pipelineOrder);
  expect(raw.animationExtension).toEqual(fixture().preset.animationExtension);
});

test('add, reorder, duplicate and remove post stages keep base order and original inactive instances', async ({ page }) => {
  await page.goto('/');
  const actual = await page.evaluate(async input => {
    const a = '/src/original-project.ts', b = '/src/original-preset.ts'; const api = await import(a), docs = await import(b);
    let project = api.projectFromOriginalPreset(docs.parseOriginalPreset(JSON.stringify(input)));
    let next = structuredClone(project); const copied = { ...structuredClone(next.effects[0]), id: 'new-ui-duplicate' };
    next.effects = [next.effects[1], copied, next.effects[0]]; project = api.commitOriginalProjectEdit(project, next);
    const added = structuredClone(project.originalCompatibility.envelope);
    next = structuredClone(project); next.effects = next.effects.filter((stage: any) => stage.originalInstanceId !== 'post-processing-1');
    project = api.commitOriginalProjectEdit(project, next);
    return { added, removed: project.originalCompatibility.envelope, effectIds: project.effects.map((stage: any) => stage.id) };
  }, fixture());
  expect(actual.added.preset.pipelineOrder).toEqual(['tint-1', 'adjustments', 'post-processing-2', 'post-processing-1', 'dither-style', 'adjustments-2']);
  expect(actual.added.preset.effectInstances['post-processing-2']).toMatchObject({ instanceId: 'post-processing-2', isOriginal: false, extension: { keep: true }, settings: { futurePost: { keep: 42 } } });
  expect(actual.removed.preset.pipelineOrder.filter((id: string) => id === 'adjustments' || id === 'adjustments-2' || id === 'dither-style')).toEqual(['adjustments', 'dither-style', 'adjustments-2']);
  expect(actual.removed.preset.effectInstances['post-processing-1'].settings).toMatchObject({ enabled: false, visible: false, futurePost: { keep: 42 } });
  expect(actual.removed.preset.effectInstances['jpeg-glitch-1']).toEqual(fixture().preset.effectInstances['jpeg-glitch-1']);
});

test('repeated IDs share value edits and conflicting simultaneous edits are rejected', async ({ page }) => {
  const input = fixture(); input.preset.pipelineOrder = ['post-processing-1', 'post-processing-1']; await page.goto('/');
  const actual = await page.evaluate(async input => {
    const a = '/src/original-project.ts', b = '/src/original-preset.ts'; const api = await import(a), docs = await import(b);
    const project = api.projectFromOriginalPreset(docs.parseOriginalPreset(JSON.stringify(input)));
    const next = structuredClone(project); next.effects[1].params.sharpen = 30;
    const edited = api.commitOriginalProjectEdit(project, next);
    const conflict = structuredClone(project); conflict.effects[0].params.sharpen = 10; conflict.effects[1].params.sharpen = 20;
    let error = ''; try { api.commitOriginalProjectEdit(project, conflict); } catch (caught) { error = (caught as Error).message; }
    return { ids: project.effects.map((s: any) => s.id), params: edited.effects.map((s: any) => s.params.sharpen), order: edited.originalCompatibility.envelope.preset.pipelineOrder, error };
  }, input);
  expect(new Set(actual.ids).size).toBe(2); expect(actual.params).toEqual([30, 30]); expect(actual.order).toEqual(input.preset.pipelineOrder); expect(actual.error).toContain('conflicting edits');
});

test('halftone, missing references and unknown engines retain documents with explicit capability results', async ({ page }) => {
  await page.goto('/');
  const actual = await page.evaluate(async input => {
    const a = '/src/original-project.ts', b = '/src/original-preset.ts', c = '/src/engine.ts'; const api = await import(a), docs = await import(b), engine = await import(c);
    let project = api.projectFromOriginalPreset(docs.parseOriginalPreset(JSON.stringify(input)));
    const next = structuredClone(project); next.mode = 'halftone'; next.halftone.dotGain = .37; project = api.commitOriginalProjectEdit(project, next);
    const half = engine.pipeline(project).find((stage: any) => stage.id === 'halftone');
    const missing = structuredClone(input); missing.preset.pipelineOrder.push('tint-99');
    const missingProject = api.projectFromOriginalPreset(docs.parseOriginalPreset(JSON.stringify(missing)));
    const unsupported = structuredClone(input); unsupported.preset.effectInstances['dither-style'].settings = { ...unsupported.preset.effectInstances['dither-style'].settings, enabled: true, style: 'atkinson' };
    const unsupportedProject = api.projectFromOriginalPreset(docs.parseOriginalPreset(JSON.stringify(unsupported)));
    return { half, missing: api.originalProjectCapabilities(missingProject), unsupported: api.originalProjectCapabilities(unsupportedProject), retainedMissing: JSON.parse(api.exportOriginalProject(missingProject)) };
  }, fixture());
  expect(actual.half.params).toMatchObject({ dotGain: .37, gcr: 1, supersample: 4 }); expect(actual.half.enabled).toBe(true);
  expect(actual.missing.canBuildPipeline).toBe(false); expect(actual.missing.processingErrors[0]).toContain('flat fallback');
  expect(actual.unsupported.canBuildPipeline).toBe(true); expect(actual.unsupported.canProcess).toBe(false); expect(actual.retainedMissing.preset.pipelineOrder.at(-1)).toBe('tint-99');
});

test('new original presets use the original schema and preserve disabled native effects', async ({ page }) => {
  await page.goto('/');
  const actual = await page.evaluate(async () => {
    const a = '/src/original-project.ts', b = '/src/model.ts', c = '/src/engine.ts', d = '/src/engine/vendor/preset-original.mjs';
    const api = await import(a), model = await import(b), engine = await import(c), vendor = await import(d);
    const native = model.initialProject(); native.ditherParams.errorReduction = 1.3;
    const effect = engine.makeEffect('tint'); effect.enabled = false; native.effects.push(effect);
    const text = api.exportOriginalProject(native, 'New source look', 'Description'); const raw = JSON.parse(text);
    return { raw, validation: vendor.importPresetObject(raw), imported: api.projectFromOriginalPreset(api.createOriginalProjectPreset(native, 'Again')) };
  });
  expect(actual.validation.success).toBe(true); expect(actual.raw.type).toBe('dither-boy-preset'); expect(actual.raw.preset.name).toBe('New source look');
  expect(actual.raw.preset.effectInstances['tint-1'].settings.enabled).toBe(false); expect(actual.raw.preset.dither.controls.errorReduction).toBe(1.3);
  expect(actual.raw.preset.effectInstances['epsilon-glow-1'].settings.visible).toBe(false); expect(actual.imported.originalCompatibility).toBeTruthy();
});

test('canonical imported processing matches the actual original worker for interleaved stages', async ({ page }) => {
  const files = new Map(await Promise.all(['imageProcessor.worker-DvXeYfV0.js', 'metadata.prod-BOBIde2r.js'].map(async name => [name, await readFile(new URL(`./fixtures/original-worker/${name}`, import.meta.url))] as const)));
  await page.route('**/preset-original-oracle/*', route => { const file = files.get(new URL(route.request().url()).pathname.split('/').at(-1)!); return file ? route.fulfill({ contentType: 'text/javascript', body: file }) : route.abort(); });
  await page.goto('/');
  const actual = await page.evaluate(async input => {
    const a = '/src/original-project.ts', b = '/src/original-preset.ts', c = '/src/engine.ts'; const api = await import(a), docs = await import(b), engine = await import(c);
    const project = api.projectFromOriginalPreset(docs.parseOriginalPreset(JSON.stringify(input)));
    const width = 32, height = 24, pixels = new Uint8ClampedArray(width * height * 4);
    for (let at = 0; at < pixels.length; at += 4) { pixels[at] = at % 251; pixels[at + 1] = at * 7 % 251; pixels[at + 2] = at * 13 % 251; pixels[at + 3] = 255; }
    const current = await engine.processImage(new ImageData(pixels.slice(), width, height), project);
    const oracle = new Worker('/preset-original-oracle/imageProcessor.worker-DvXeYfV0.js', { type: 'module' });
    await new Promise<void>((resolve, reject) => { oracle.onmessage = ({ data }) => { if (data.type === 'ready') resolve(); }; oracle.onerror = () => reject(Error('Original oracle unavailable')); });
    const url = await new Promise<string>((resolve, reject) => { oracle.onmessage = ({ data }) => data.type === 'error' ? reject(Error(data.error)) : resolve(data.dataUrl); oracle.postMessage({ type: 'process', requestId: 'preset-project', imageData: new ImageData(pixels, width, height), effectSettings: {}, effectInstances: input.preset.effectInstances, pipelineOrder: input.preset.pipelineOrder }); });
    const bitmap = await createImageBitmap(await (await fetch(url)).blob()), canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0); bitmap.close(); oracle.terminate();
    const expected = context.getImageData(0, 0, width, height).data;
    return { same: current.data.every((value: number, at: number) => value === expected[at]), order: engine.pipeline(project).map((stage: any) => stage.id) };
  }, fixture());
  expect(actual.same).toBe(true); expect(actual.order).toEqual(['postProcessing', 'adjustments', 'tint', 'dither', 'adjustments']);
});
