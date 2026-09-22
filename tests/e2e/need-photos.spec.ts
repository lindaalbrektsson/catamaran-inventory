import { test, expect } from '@playwright/test';
import sharp from 'sharp';
for (const lang of ['en', 'es'])
  test(`Need photo camera, replace, remove and save ${lang}`, async ({ page }) => {
    await page.goto('http://127.0.0.1:4174/?view=need&lang=' + lang);
    await page.locator('input[name="name"]').fill('Photo fixture');
    const bytes = await sharp({
      create: { width: 120, height: 80, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: lang === 'en' ? 'Take photo' : 'Tomar foto', exact: true })
      .click();
    await (await chooser).setFiles({ name: 'part.png', mimeType: 'image/png', buffer: bytes });
    const preview = page.getByRole('img', { name: lang === 'en' ? 'Open photo' : 'Abrir foto' });
    await expect(preview).toBeVisible();
    await expect(page.getByText('part.jpg', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: lang === 'en' ? 'Remove photo' : 'Quitar foto' })
      .click();
    await expect(preview).toHaveCount(0);
    const gallery = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: lang === 'en' ? 'Choose image' : 'Elegir imagen', exact: true })
      .click();
    await (await gallery).setFiles({ name: 'label.png', mimeType: 'image/png', buffer: bytes });
    await expect(preview).toBeVisible();
    const replacement = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: lang === 'en' ? 'Replace image' : 'Reemplazar imagen' })
      .click();
    await (
      await replacement
    ).setFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: bytes });
    await expect(page.getByText('replacement.jpg', { exact: true })).toBeVisible();
    await page
      .getByRole('button', {
        name: lang === 'en' ? 'Save purchase need' : 'Guardar pendiente de compra',
        exact: true,
      })
      .click();
    await expect
      .poll(async () => page.evaluate(() => sessionStorage.getItem('need-fixture')))
      .not.toBeNull();
    const saved = JSON.parse((await page.evaluate(() => sessionStorage.getItem('need-fixture')))!);
    expect(saved.photo).toMatchObject({ name: 'replacement.jpg', type: 'image/jpeg' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
test('Need image engine optimizes large source and reuses processed bytes on retry', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/?view=need');
  const result = await page.evaluate(async () => {
    const path = '/image-processing.ts';
    const { optimizedImage } = await import(path);
    const c = document.createElement('canvas');
    c.width = 4000;
    c.height = 3000;
    c.getContext('2d')!.fillRect(0, 0, 4000, 3000);
    const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), 'image/jpeg'));
    const file = new File([blob, new Uint8Array(25 * 1024 * 1024)], 'camera.jpg', {
      type: 'image/jpeg',
    });
    const out = await optimizedImage(file, 'need');
    const retry = await optimizedImage(file, 'need');
    const reused = await optimizedImage(out, 'need');
    return { size: out.size, source: file.size, same: out === retry && out === reused };
  });
  expect(result.source).toBeGreaterThan(20 * 1024 * 1024);
  expect(result.size).toBeLessThanOrEqual(3 * 1024 * 1024);
  expect(result.same).toBe(true);
});
test('Need rejects PDF and disguised images without a preview', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/?view=need');
  const input = page.locator('input[type="file"]:not([capture])');
  await expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  for (const [name, mimeType] of [
    ['fake.jpg', 'image/jpeg'],
    ['paper.pdf', 'application/pdf'],
  ]) {
    await input.setInputFiles({ name, mimeType, buffer: Buffer.from('invalid bytes') });
    await expect(page.getByRole('alert')).toContainText('Choose a valid');
    await expect(page.getByRole('img', { name: 'Open photo' })).toHaveCount(0);
  }
});
