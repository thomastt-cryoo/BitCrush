import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

function preset(name = 'Original print') {
  const stage = (id: string, type: string, settings: any) => ({ type, instanceId: id, label: id, settings, isDuplicatable: true, isOriginal: false, extra: { preserved: 42 } });
  return {
    type: 'dither-boy-preset', version: '6.0.3', exportedAt: 100, exportedBy: 'Original', extension: { untouched: true },
    preset: { id: 'original-print', name, createdAt: 1, updatedAt: 2, version: '6.0.3',
      colorPalette: { category: 'Source', paletteId: 'custom', customColors: ['#000000', '#ffffff'], colorDepth: 8 },
      dither: { category: 'basic', style: 'none', scale: 45, luminanceThreshold: 50, controls: {} },
      effectInstances: {
        'post-processing-1': stage('post-processing-1', 'postProcessing', { enabled: true, invert: true, sharpen: 0, blur: 0, hue: 0, future: 'keep' }),
        adjustments: stage('adjustments', 'adjustments', { enabled: false, brightness: 63, contrast: 100, saturation: 100, midtones: 50, highlights: 50, blur: 0, denoise: 0, hue: 0 }),
        'dither-style': stage('dither-style', 'dither', { enabled: false, style: 'none', scale: 45, luminanceThreshold: 50, colorDepth: 8, palette: ['#000000', '#ffffff'], controls: {} }),
      }, pipelineOrder: ['post-processing-1', 'adjustments', 'dither-style'], future: ['retain'] },
  };
}

test('imports an original preset, exports untouched bytes and retains graph through edits and reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText('Updating preview')).toHaveCount(0, { timeout: 45000 });
  const original = '\n' + JSON.stringify(preset(), null, '\t') + '\n';
  await page.getByLabel('Choose original preset', { exact: true }).setInputFiles({ name: 'original.dither-boy.preset', mimeType: 'application/json', buffer: Buffer.from(original) });
  await expect(page.getByRole('button', { name: 'Original print', exact: true })).toBeVisible();
  await expect(page.getByText('Updating preview')).toHaveCount(0, { timeout: 45000 });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Original print', exact: true }).click();
  const download = await downloading;
  expect(await readFile((await download.path())!, 'utf8')).toBe(original);
  await page.getByRole('button', { name: /^Effects(?:\s+\d+)?$/ }).click();
  await page.getByRole('switch', { name: 'Invert', exact: true }).uncheck();
  const editedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export current preset', exact: true }).click();
  const edited = JSON.parse(await readFile((await (await editedDownload).path())!, 'utf8'));
  expect(edited.extension).toEqual({ untouched: true });
  expect(edited.preset.pipelineOrder).toEqual(preset().preset.pipelineOrder);
  expect(edited.preset.effectInstances['post-processing-1'].settings).toMatchObject({ invert: false, future: 'keep' });
  expect(edited.preset.effectInstances.adjustments.settings).toMatchObject({ enabled: false, brightness: 63 });
  await page.getByRole('button', { name: 'Reset all settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Enable pattern', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Enable pattern', exact: true })).toBeVisible();
  const undoDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export current preset', exact: true }).click();
  const undone = JSON.parse(await readFile((await (await undoDownload).path())!, 'utf8'));
  expect(undone.preset).toEqual({ ...edited.preset, updatedAt: undone.preset.updatedAt });
  expect(undone.extension).toEqual(edited.extension);
  await page.reload();
  await page.getByRole('tab', { name: 'Presets', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Original print', exact: true })).toBeVisible();
  const persistedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Original print', exact: true }).click();
  expect(await readFile((await (await persistedDownload).path())!, 'utf8')).toBe(original);
});

test('deletes the selected preset when the library is filtered', async ({ page }) => {
  await page.goto('/');
  for (const name of ['First look', 'Second look']) {
    await page.getByLabel('Choose original preset', { exact: true }).setInputFiles({ name: 'original.preset', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(preset(name))) });
  }
  await page.getByLabel('Search presets', { exact: true }).fill('Second');
  await page.getByRole('button', { name: 'Delete Second look', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Second look', exact: true })).toHaveCount(0);
  await page.getByLabel('Search presets', { exact: true }).fill('');
  await expect(page.getByRole('button', { name: 'First look', exact: true })).toBeVisible();
});
