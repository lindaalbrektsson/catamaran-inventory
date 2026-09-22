import { test, expect } from '@playwright/test';
import sharp from 'sharp';
const base = 'http://127.0.0.1:4174/';

for (const lang of ['en', 'es'])
  test(`document camera and file picker ${lang}`, async ({ page }) => {
    await page.goto(base + '?view=document-form&lang=' + lang);
    const camera = page.locator('input[capture="environment"]');
    await expect(camera).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    const pick = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: lang === 'en' ? 'Take photo' : 'Tomar foto', exact: true })
      .click();
    await (
      await pick
    ).setFiles({
      name: 'paper.jpg',
      mimeType: 'image/jpeg',
      buffer: await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } })
        .jpeg()
        .toBuffer(),
    });
    await expect(page.getByRole('status')).toContainText('paper.jpg');
    const choose = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: lang === 'en' ? 'Choose file' : 'Elegir archivo', exact: true })
      .click();
    await (
      await choose
    ).setFiles({
      name: 'paper.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF'),
    });
    await expect(page.getByRole('status')).toContainText('paper.pdf');
    await expect(
      page.getByText(lang === 'en' ? 'Images or PDF · max 30 MB' : 'Imágenes o PDF · máx. 30 MB', {
        exact: true,
      }),
    ).toBeVisible();
  });
for (const format of ['jpeg', 'png', 'webp'] as const)
  test(`actual ${format} decoding and metadata stripping`, async ({ page }) => {
    await page.goto(base + '?view=document-form');
    const bytes = await sharp({
      create: { width: 120, height: 80, channels: 3, background: 'white' },
    })
      .withMetadata({ orientation: 6 })
      [format]()
      .toBuffer();
    const result = await page.evaluate(
      async ({ bytes, mime }) => {
        const path = '/image-processing.ts';
        const { processUploadImage } = await import(path);
        const f = new File([new Uint8Array(bytes)], 'photo', { type: mime });
        const out = await processUploadImage(f, 'document');
        return Array.from(new Uint8Array(await out.arrayBuffer()));
      },
      { bytes: Array.from(bytes), mime: 'image/' + format },
    );
    const info = await sharp(Buffer.from(result)).metadata();
    expect(info.format).toBe('jpeg');
    expect(info.exif).toBeUndefined();
    expect(info.width).toBe(80);
    expect(info.height).toBe(120);
  });
test('large phone source is compressed locally and disguised bytes are rejected', async ({
  page,
}) => {
  await page.goto(base + '?view=document-form');
  const result = await page.evaluate(async () => {
    const path = '/image-processing.ts';
    const { processUploadImage } = await import(path);
    const c = document.createElement('canvas');
    c.width = 4000;
    c.height = 3000;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'black';
    ctx.font = '80px sans-serif';
    ctx.fillText('DOCUMENT TEXT 123', 100, 150);
    const b = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.95));
    const f = new File([b, new Uint8Array(25 * 1024 * 1024)], 'phone.jpg', { type: 'image/jpeg' });
    const out = await processUploadImage(f, 'document');
    let rejected = false;
    try {
      await processUploadImage(
        new File(['<html>fake</html>'], 'fake.jpg', { type: 'image/jpeg' }),
        'document',
      );
    } catch {
      rejected = true;
    }
    return { source: f.size, stored: out.size, rejected };
  });
  expect(result.source).toBeGreaterThan(20 * 1024 * 1024);
  expect(result.stored).toBeLessThanOrEqual(5 * 1024 * 1024);
  expect(result.rejected).toBe(true);
});
