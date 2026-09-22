import { test, expect, type Page } from '@playwright/test';
const url = 'http://127.0.0.1:4174/?view=voice-update';
async function microphone(page: Page, denied = false) {
  await page.addInitScript((denied) => {
    let calls = 0;
    Object.defineProperty(window, 'microphoneCalls', { get: () => calls });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        calls++;
        if (denied) throw new DOMException('Denied', 'NotAllowedError');
        const context = new AudioContext(),
          osc = context.createOscillator(),
          dest = context.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        await context.resume();
        for (const track of dest.stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => {
            stop();
            if (context.state !== 'closed') void context.close().catch(() => {});
          };
        }
        return dest.stream;
      },
    });
  }, denied);
}
async function record(page: Page) {
  await page.getByRole('button', { name: 'Record voice note', exact: true }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Recording');
  await expect(page.getByRole('button', { name: 'Add update', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('0:01');
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.locator('audio')).toHaveCount(1);
}
test('explicit microphone, record/stop, preview, save voice-only and play after reload', async ({
  page,
}) => {
  await microphone(page);
  await page.goto(url);
  expect(await page.evaluate(() => Reflect.get(window, 'microphoneCalls'))).toBe(0);
  await record(page);
  expect(await page.evaluate(() => localStorage.getItem('voice-fixture'))).toBeNull();
  await page.locator('audio').evaluate(async (a) => {
    await (a as HTMLAudioElement).play();
  });
  await expect
    .poll(() => page.locator('audio').evaluate((a) => (a as HTMLAudioElement).paused))
    .toBe(false);
  await page.locator('audio').evaluate((a) => (a as HTMLAudioElement).pause());
  await page.getByRole('button', { name: 'Add update', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.reload();
  const audio = page.getByRole('region', { name: 'Saved update' }).locator('audio');
  await expect(audio).toHaveCount(1);
  await audio.evaluate(async (a) => {
    await (a as HTMLAudioElement).play();
  });
  await expect.poll(() => audio.evaluate((a) => (a as HTMLAudioElement).paused)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('denied microphone is clear, no automatic request or save', async ({ page }) => {
  await microphone(page, true);
  await page.goto(url);
  await page.getByRole('button', { name: 'Record voice note', exact: true }).click();
  expect(await page.evaluate(() => Reflect.get(window, 'microphoneCalls'))).toBe(0);
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('permission was denied');
  expect(await page.evaluate(() => localStorage.getItem('voice-fixture'))).toBeNull();
  await expect(page.locator('audio')).toHaveCount(0);
});
test('delete/re-record and text plus photo plus voice remain an explicit save', async ({
  page,
}) => {
  await microphone(page);
  await page.goto(url);
  await record(page);
  await page.getByRole('button', { name: 'Delete recording', exact: true }).click();
  await expect(page.locator('audio')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('0:01');
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.locator('audio')).toHaveCount(1);
  await page.getByRole('button', { name: 'Record again', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('0:01');
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page.getByRole('textbox', { name: 'Update', exact: true }).fill('Checked hinge');
  await page.locator('input[capture=environment]').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: await (
      await import('sharp')
    )
      .default({ create: { width: 10, height: 10, channels: 3, background: 'white' } })
      .png()
      .toBuffer(),
  });
  await page.getByRole('button', { name: 'Add update', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('voice-fixture')!));
  expect(saved).toMatchObject({ body: 'Checked hinge', hasPhoto: true });
  expect(saved.voice).toContain('data:audio/');
});
test('unsupported recording and Spanish controls', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'MediaRecorder', { value: undefined }),
  );
  await page.goto(url + '&lang=es');
  await page.getByRole('button', { name: 'Grabar nota de voz', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar grabación', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('no permite grabar');
});
test('production headers permit only same-origin microphone and file route denies anonymous', async ({
  request,
}) => {
  const page = await request.get('/login');
  expect(page.headers()['permissions-policy']).toContain('microphone=(self)');
  const file = await request.get('/task-update-file/50000000-0000-4000-8000-000000000001/voice');
  expect(file.status()).toBe(401);
  expect(file.headers()['cache-control']).toContain('no-store');
});

test('recording timer shows the maximum and warns near the existing limit', async ({ page }) => {
  await microphone(page);
  await page.clock.install();
  await page.goto(url);
  await page.getByRole('button', { name: 'Record voice note', exact: true }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('timer')).toContainText('/ 03:00');
  await page.clock.fastForward(151000);
  await expect(page.getByRole('timer')).toContainText('02:31 / 03:00');
  await expect(page.getByText('Recording will stop at 3 minutes.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('voice-fixture'))).toBeNull();
});
