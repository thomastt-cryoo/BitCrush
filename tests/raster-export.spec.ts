import { test, expect } from '@playwright/test';

test('JPEG retains the original white alpha background while PNG retains transparency', async ({ page }) => {
  await page.goto('/');
  const actual = await page.evaluate(async () => {
    const path = '/src/raster-export.ts';
    const { encodeRaster } = await import(path);
    const image = new ImageData(64, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      image.data[i] = 255; image.data[i + 3] = x < 32 ? 0 : 128;
    }
    const read = async (format: string) => {
      const blob = await encodeRaster(image, format, 95);
      const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 32;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0); bitmap.close();
      return { type: blob.type, transparent: Array.from(context.getImageData(8, 16, 1, 1).data), partial: Array.from(context.getImageData(48, 16, 1, 1).data) };
    };
    return { png: await read('png'), jpeg: await read('jpg') };
  });
  expect(actual.png.type).toBe('image/png');
  expect(actual.png.transparent[3]).toBe(0);
  expect(actual.png.partial[3]).toBe(128);
  expect(actual.jpeg.type).toBe('image/jpeg');
  for (const channel of actual.jpeg.transparent) expect(channel).toBeGreaterThanOrEqual(250);
  expect(actual.jpeg.partial[0]).toBeGreaterThanOrEqual(250);
  expect(actual.jpeg.partial[1]).toBeGreaterThanOrEqual(122);
  expect(actual.jpeg.partial[1]).toBeLessThanOrEqual(132);
  expect(actual.jpeg.partial[2]).toBeGreaterThanOrEqual(122);
  expect(actual.jpeg.partial[2]).toBeLessThanOrEqual(132);
  expect(actual.jpeg.partial[3]).toBe(255);
});
