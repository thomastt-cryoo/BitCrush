import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const instance = (id: string, type: string, settings: Record<string, unknown>) => ({
  type, instanceId: id, label: `<b>${id}</b>`, customLabel: ' retained ', settings,
  isDuplicatable: true, isOriginal: false, extension: { keep: ['instance', 7] },
});
function fixture() {
  return {
    type: 'dither-boy-preset', version: '6.0.3', exportedAt: 100, exportedBy: 'Dither Boy 6.0.3',
    envelopeExtension: { nested: ['preserve', { enabled: false }] },
    preset: {
      id: 'fixture-original-id', name: ' <b>Keep my name</b> ', createdAt: 10, updatedAt: 20, version: '6.0.3',
      colorPalette: { category: 'Source', paletteId: '__saved_source_123__', customColors: ['#AbCdEf', '#ffffff'], colorDepth: 8, orderedCycling: false, extraPalette: { keep: true } },
      dither: { category: 'all', style: 'none', scale: 45, luminanceThreshold: 50, controls: { originalParameter: 7 }, extraDither: 'keep' },
      effectInstances: {
        adjustments: instance('adjustments', 'adjustments', { enabled: false, brightness: 100, contrast: 100, saturation: 100, midtones: 50, highlights: 50, blur: 0, denoise: 0, hue: 0 }),
        'dither-style': instance('dither-style', 'dither', { enabled: false, style: 'none', scale: 45, luminanceThreshold: 50, palette: ['#AbCdEf', '#ffffff'], colorDepth: 8, orderedCycling: false, controls: { originalParameter: 7 } }),
        'post-processing-1': instance('post-processing-1', 'postProcessing', { enabled: true, visible: false, invert: true, sharpen: 0, blur: 0, hue: 0, futureSetting: { keep: 9 } }),
        'post-processing-2': instance('post-processing-2', 'postProcessing', { enabled: false, invert: false, sharpen: 13, blur: 0, hue: 0 }),
        'jpeg-glitch-1': instance('jpeg-glitch-1', 'jpegGlitch', { enabled: true, blockShift: { enabled: false, amount: 0, futureNested: { keep: 42 } }, channelSwap: { enabled: false, amount: 0 } }),
      },
      pipelineOrder: ['post-processing-1', 'dither-style', 'adjustments', 'post-processing-1', 'post-processing-2'],
      animationExtension: { layers: [{ propertyPath: 'postProcessing.sharpen', fromValue: 0, toValue: 20 }], fps: 30 },
    },
  };
}

test('raw preset retains envelope extensions, duplicate IDs, labels, absent fields and original bytes', async ({ page }) => {
  const original = '\n' + JSON.stringify(fixture(), null, '\t') + '\n';
  await page.goto('/');
  const result = await page.evaluate(async text => {
    const path = '/src/original-preset.ts'; const api = await import(path);
    const document = api.parseOriginalPreset(text);
    const graph = api.getOriginalPresetGraph(document);
    graph.pipelineOrder.reverse();
    return { text: api.serializeOriginalPreset(document), raw: document.envelope, edited: document.edited, frozen: Object.isFrozen(document.envelope.preset.effectInstances), order: document.envelope.preset.pipelineOrder };
  }, original);
  expect(result.text).toBe(original);
  expect(result.raw).toEqual(fixture());
  expect(result.edited).toBe(false); expect(result.frozen).toBe(true);
  expect(result.order).toEqual(fixture().preset.pipelineOrder);
  expect(result.raw.preset).not.toHaveProperty('halftone');
});

test('targeted edits preserve nested siblings, identity, raw selector spelling and original input', async ({ page }) => {
  const source = fixture(); await page.goto('/');
  const result = await page.evaluate(async input => {
    const path = '/src/original-preset.ts'; const api = await import(path);
    const original = api.parseOriginalPreset(JSON.stringify(input));
    let edited = api.patchOriginalPresetLeaf(original, ['preset', 'effectInstances', 'jpeg-glitch-1', 'settings', 'blockShift', 'amount'], 12);
    edited = api.patchOriginalPresetLeaf(edited, ['preset', 'effectInstances', 'jpeg-glitch-1', 'settings', 'blockShift', 'enabled'], true);
    edited = api.patchOriginalPresetLeaf(edited, ['preset', 'pipelineOrder'], ['post-processing-2', ...input.preset.pipelineOrder]);
    const exported = JSON.parse(api.serializeOriginalPreset(edited, { updatedAt: 99, exportedAt: 101, exportedBy: 'BitCrush' }));
    return { exported, original: original.envelope, edited: edited.edited };
  }, source);
  const expected = structuredClone(source);
  expected.preset.effectInstances['jpeg-glitch-1'].settings.blockShift = { enabled: true, amount: 12, futureNested: { keep: 42 } };
  expected.preset.pipelineOrder.unshift('post-processing-2'); expected.preset.updatedAt = 99; expected.exportedAt = 101; expected.exportedBy = 'BitCrush';
  expect(result.exported).toEqual(expected); expect(result.original).toEqual(source); expect(result.edited).toBe(true);
});

test('canonical pipeline keeps original order, repeated IDs, duplicates and disabled stages', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async input => {
    const path = '/src/original-preset.ts'; const api = await import(path);
    const pipeline = api.buildOriginalPresetPipeline(api.parseOriginalPreset(JSON.stringify(input)));
    return pipeline;
  }, fixture());
  expect(result.map((s: { id: string }) => s.id)).toEqual(['postProcessing', 'dither', 'adjustments', 'postProcessing', 'postProcessing']);
  expect(result.map((s: { enabled: boolean }) => s.enabled)).toEqual([true, false, false, true, false]);
  expect(result[0].params.invert).toBe(true); expect(result[3]).toEqual(result[0]); expect(result[4].params.sharpen).toBe(13);
  expect(result[1].params).toMatchObject({ scale: 45, palette: ['#AbCdEf', '#ffffff'], controls: { originalParameter: 7 } });
  expect(result[1].params).not.toHaveProperty('colorDepth'); // Original mapper slices the palette, then omits depth.
});

test('global halftone replaces disabled dither slots without conversion or insertion', async ({ page }) => {
  const input = { ...fixture(), preset: { ...fixture().preset, halftone: { enabled: true, mode: 'cmyk', cellSize: 10, dotGain: .2, gcr: 1, supersample: 3, futureHalf: { keep: true } } } };
  input.preset.pipelineOrder = ['dither-style', 'dither-style']; await page.goto('/');
  const result = await page.evaluate(async input => {
    const path = '/src/original-preset.ts'; const api = await import(path);
    const source = api.parseOriginalPreset(JSON.stringify(input));
    const pipeline = api.buildOriginalPresetPipeline(source);
    const noSlot = api.patchOriginalPresetLeaf(source, ['preset', 'pipelineOrder'], []);
    return { pipeline, noSlot: api.buildOriginalPresetPipeline(noSlot), raw: JSON.parse(api.serializeOriginalPreset(source)) };
  }, input);
  expect(result.pipeline.map((s: { id: string; enabled: boolean }) => [s.id, s.enabled])).toEqual([['halftone', true], ['halftone', true]]);
  expect(result.pipeline[0].params).toMatchObject({ dotGain: .2, gcr: 1, supersample: 3 }); expect(result.noSlot).toEqual([]); expect(result.raw).toEqual(input);
});

test('missing references require explicit original flat fallback, while ID prefix determines dispatch', async ({ page }) => {
  const input = fixture(); input.preset.pipelineOrder = ['post-processing-8']; await page.goto('/');
  const result = await page.evaluate(async input => {
    const path = '/src/original-preset.ts'; const api = await import(path);
    const source = api.parseOriginalPreset(JSON.stringify(input)); let missing = '';
    try { api.buildOriginalPresetPipeline(source); } catch (error) { missing = (error as Error).message; }
    const fallback = api.buildOriginalPresetPipeline(source, { postProcessing: { enabled: false, invert: true, sharpen: 17 } });
    const mismatch = api.patchOriginalPresetLeaf(source, ['preset', 'effectInstances', 'post-processing-1', 'type'], 'adjustments');
    const ordered = api.patchOriginalPresetLeaf(mismatch, ['preset', 'pipelineOrder'], ['post-processing-1']);
    return { missing, fallback, mismatched: api.buildOriginalPresetPipeline(ordered) };
  }, input);
  expect(result.missing).toContain('Cannot reconstruct original flat fallback');
  expect(result.fallback).toEqual([{ id: 'postProcessing', enabled: false, params: { sharpen: 17, blur: 0, invert: true, hue: 0 } }]);
  expect(result.mismatched[0].id).toBe('postProcessing'); expect(result.mismatched[0].params.invert).toBe(true);
});

test('diagnostics match original import boundaries without sanitizing accepted values', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async input => {
    const path = '/src/original-preset.ts', vendor = '/src/engine/vendor/preset-original.mjs';
    const api = await import(path), original = await import(vendor);
    const variants: Array<[string, any]> = [];
    const add = (name: string, change: (v: any) => void) => { const value = structuredClone(input); change(value); variants.push([name, value]); };
    add('valid original threshold255 and depth256', v => { v.preset.dither.luminanceThreshold = 255; v.preset.colorPalette.colorDepth = 256; });
    add('name100', v => { v.preset.name = 'n'.repeat(100); });
    add('name101', v => { v.preset.name = 'n'.repeat(101); });
    add('colors256', v => { v.preset.colorPalette.customColors = Array(256).fill('#ffffff'); });
    add('colors257', v => { v.preset.colorPalette.customColors = Array(257).fill('#ffffff'); });
    add('pipeline50', v => { v.preset.pipelineOrder = Array(50).fill('post-processing-1'); });
    add('pipeline51', v => { v.preset.pipelineOrder = Array(51).fill('post-processing-1'); });
    add('bad threshold256', v => { v.preset.dither.luminanceThreshold = 256; });
    add('bad color', v => { v.preset.colorPalette.customColors[0] = '#fff'; });
    add('warning retained', v => { v.preset.description = 'd'.repeat(501); });
    add('oversize', v => { v.extra = 'x'.repeat(1024 * 1024); });
    add('wrong envelope', v => { v.type = 'other'; });
    return variants.map(([name, value]) => {
      const diagnostic = original.importPresetObject(value); let accepted = false, error = '', warnings: unknown[] = [];
      try { const parsed = api.parseOriginalPreset(JSON.stringify(value)); accepted = true; warnings = parsed.issues.filter((i: any) => i.severity === 'warning'); }
      catch (caught) { error = (caught as Error).message; }
      return { name, accepted, originalAccepted: diagnostic.success, error, originalError: diagnostic.error, warnings };
    });
  }, fixture());
  for (const row of result) { expect(row.accepted, row.name).toBe(row.originalAccepted); if (!row.accepted) expect(row.error, row.name).toBe(row.originalError); }
  expect(result.find((row: { name: string }) => row.name === 'warning retained')!.warnings).toHaveLength(1);
});

test('patch refuses invented parents and non-JSON values; unknown enabled processors fail explicitly', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async input => {
    const path = '/src/original-preset.ts'; const api = await import(path); const source = api.parseOriginalPreset(JSON.stringify(input));
    const errors: string[] = [];
    for (const action of [() => api.patchOriginalPresetLeaf(source, ['preset', 'missingParent', 'leaf'], 1), () => api.patchOriginalPresetLeaf(source, ['preset', 'name'], undefined), () => api.patchOriginalPresetLeaf(source, ['preset', 'dither', 'scale'], Infinity)]) {
      try { action(); } catch (error) { errors.push((error as Error).message); }
    }
    const unknown: any = structuredClone(input); unknown.preset.effectInstances['future-1'] = { ...unknown.preset.effectInstances['post-processing-1'], instanceId: 'future-1', type: 'future', settings: { enabled: true } }; unknown.preset.pipelineOrder.push('future-1');
    const retained = api.parseOriginalPreset(JSON.stringify(unknown));
    try { api.buildOriginalPresetPipeline(retained); } catch (error) { errors.push((error as Error).message); }
    return { errors, unchanged: JSON.parse(api.serializeOriginalPreset(retained)) };
  }, fixture());
  expect(result.errors).toHaveLength(4); expect(result.errors[0]).toContain('missing preset parent'); expect(result.errors[3]).toContain('cannot be silently omitted');
  expect(result.unchanged.preset.effectInstances['future-1'].settings.enabled).toBe(true);
});

test('the existing original validator/helper and provenance remain byte-identical', async () => {
  const source = await readFile(new URL('../src/engine/vendor/preset-original.mjs', import.meta.url));
  expect(createHash('sha256').update(source).digest('hex')).toBe('190c2424910e83f62609f51b70c2e4c056bf7276ed1bd2b68dce9881f8ca6a01');
  const provenance = await readFile(new URL('../src/engine/vendor/preset-provenance.json', import.meta.url));
  expect(createHash('sha256').update(provenance).digest('hex')).toBe('62cc5a4f8c2b189241d96374d322fa6ec2af3ad3efcbef8a53a513b9122e5fcd');
});
