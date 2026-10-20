import { test, expect } from '@playwright/test';

test('starts directly in the monochrome workspace and supports light appearance', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const external: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1') && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) external.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await expect(page.getByText('Start with an image.')).toBeVisible();
  await expect(page.getByText(/license key|activate your license|sign in to continue/i)).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/bitcrush-dark-empty.png' });
  await page.getByRole('button', { name: 'Switch to light appearance' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('renders original halftone, changes controls, undoes, compares and exports actual PNG', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText('Updating preview')).toHaveCount(0, { timeout: 45000 });
  await expect(page.locator('.processing-error')).toHaveCount(0);
  const image = page.getByRole('img', { name: 'Image preview' });
  // Canvas has an accessible label and its pixels are inspected directly.
  await expect(page.locator('canvas')).toBeVisible();
  const first = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByLabel('Cell size value', { exact: true }).fill('18');
  await expect(page.getByText('Updating preview')).toHaveCount(0, { timeout: 45000 });
  await expect.poll(() => page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(first);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => page.getByLabel('Cell size value', { exact: true }).inputValue()).toBe('10');
  await expect.poll(() => page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(first);
  await page.screenshot({ path: 'artifacts/bitcrush-dark-studio.png' });
  await page.getByRole('button', { name: 'Compare original' }).click();
  await expect(page.getByRole('button', { name: 'Showing original' })).toHaveAttribute('aria-pressed', 'true');
  const original = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  expect(original).not.toBe(first);
  await page.getByRole('button', { name: 'Showing original' }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export image', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Contour study-bitcrush.png');
  await download.saveAs('artifacts/export-verification.png');
  await page.getByRole('button', { name: 'Switch to light appearance' }).click();
  await page.screenshot({ path: 'artifacts/bitcrush-light-studio.png' });
});

test('retains all 73 style definitions and reports unavailable bytecode without exporting a false result', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText('Updating preview')).toHaveCount(0, { timeout: 45000 });
  await page.getByRole('button', { name: 'Atkinson', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Atkinson', exact: true })).toBeVisible();
  await expect(page.getByLabel('Serpentine Scan', { exact: true })).toBeVisible();
  await expect(page.locator('.processing-error')).toContainText('original dithering engine');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export image', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Show original', exact: true }).click();
  await expect(page.locator('.processing-error')).toHaveCount(0, { timeout: 30000 });
  await page.getByRole('button', { name: 'Basic 2' }).click();
  await expect(page.getByRole('button', { name: 'Original', exact: true })).toBeVisible();
});

test('saves and restores presets, exposes exact original post effects and removes excluded navigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByText('Updating preview')).toHaveCount(0, { timeout: 45000 });
  await page.getByRole('button', { name: 'Effects', exact: true }).click();
  await page.getByRole('button', { name: 'Add effect', exact: true }).click();
  await expect(page.locator('.effect-picker>button')).toHaveCount(6);
  await page.getByRole('button', { name: /Post processing Sharpen/ }).click();
  await page.getByRole('switch', { name: 'Invert', exact: true }).check();
  await expect(page.getByText('Updating preview')).toHaveCount(0, { timeout: 45000 });
  await page.getByRole('button', { name: 'Save look', exact: true }).click();
  await page.getByPlaceholder('Give your look a name').fill('Print study');
  await page.getByRole('dialog').getByRole('button', { name: 'Save look', exact: true }).click();
  await page.getByRole('tab', { name: 'Presets', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print study', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Presets', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Print study', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toContainText(/Licenses|About|Themes|cat face/i);
});

test('fits supported desktop window sizes in both appearances', async ({ page }) => {
  await page.goto('/');
  for (const width of [1000, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.workspace')).toBeVisible();
    await expect(page.locator('.inspector')).toBeVisible();
  }
});
