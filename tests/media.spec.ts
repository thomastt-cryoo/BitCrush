import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('original offline media runtime encodes audio MP4 and imports its 24 frames', async ({ page }) => {
  test.setTimeout(150000);
  const external: string[] = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.protocol === 'blob:' || url.protocol === 'data:') return route.continue();
    external.push(url.href);
    return route.abort('internetdisconnected');
  });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const module = '/src/media.ts';
    const { verifyMediaRuntime } = await import(module);
    return verifyMediaRuntime();
  });
  expect(result.passed).toBe(true);
  expect(result.decode.frameCount).toBe(24);
  expect(result.encodedProbe.metadata.streams.map((stream: any) => stream.codec_name)).toEqual(['h264', 'aac']);
  expect(result.decode.audioBytes).toBeGreaterThan(0);
  expect(external).toEqual([]);
});

test('imports a video, scrubs frames and exports the edited clip with audio', async ({ page }) => {
  test.setTimeout(150000);
  await page.goto('/');
  await page.getByLabel('Choose image', { exact: true }).setInputFiles('tests/fixtures/one-second.mp4');
  await expect(page.getByLabel('Video frame', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByText('Updating preview')).toHaveCount(0, { timeout: 30000 });
  await page.getByLabel('Video frame', { exact: true }).fill('12');
  await expect(page.locator('.video-transport')).toContainText('0.50s');
  const before = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole('button', { name: 'Adjustments', exact: true }).click();
  await page.getByLabel('Brightness value', { exact: true }).fill('50');
  await expect.poll(() => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(before);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Include audio' })).toBeChecked();
  const pending = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: 'Export video', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('one-second-bitcrush.mp4');
  const path = await download.path();
  const bytes = [...await readFile(path!)];
  const decoded = await page.evaluate(async bytes => {
    const module = '/src/media.ts';
    const { getMediaRuntime } = await import(module);
    const runtime = await getMediaRuntime();
    const clip = await runtime.importVideoFile(new File([new Uint8Array(bytes)], 'export.mp4', { type: 'video/mp4' }), { extractAllFrames: true });
    const result = { count: clip.frames.length, audio: clip.audioBuffer?.byteLength ?? 0, width: clip.metadata.width, height: clip.metadata.height };
    URL.revokeObjectURL(clip.url);
    return result;
  }, bytes);
  expect(decoded).toEqual({ count: 24, audio: expect.any(Number), width: 160, height: 96 });
  expect(decoded.audio).toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/bitcrush-video-workspace.png' });
});

test('cancels video import and leaves the workspace usable', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose image', { exact: true }).setInputFiles('tests/fixtures/one-second.mp4');
  await page.locator('.media-progress').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.media-progress')).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByLabel('Video frame', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.processing-error')).toHaveCount(0);
});
