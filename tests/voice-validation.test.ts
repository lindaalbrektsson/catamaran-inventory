import { it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
vi.mock('server-only', () => ({}));
import { validateVoice } from '@/lib/voice-validation';
it.each([
  ['tone.webm', 'audio/webm'],
  ['tone.aac.mp4', 'audio/mp4'],
])('probes real synthetic %s bytes and actual packet duration', async (file, mime) => {
  const duration = await validateVoice(await readFile('tests/fixtures/voice/' + file), mime);
  expect(duration).toBeGreaterThan(0.1);
  expect(duration).toBeLessThan(2);
});
it('rejects spoofed MIME, invalid bytes and oversized input', async () => {
  await expect(validateVoice(new Uint8Array(5242881), 'audio/webm')).rejects.toThrow('voiceSize');
  await expect(validateVoice(Buffer.from('not audio'), 'audio/webm')).rejects.toThrow(
    'voiceInvalid',
  );
  await expect(
    validateVoice(await readFile('tests/fixtures/voice/tone.webm'), 'audio/mp4'),
  ).rejects.toThrow('voiceInvalid');
});

it('rejects real WebM packet timestamps beyond three minutes even with a small file', async () => {
  const raw = await readFile('tests/fixtures/voice/tone.webm');
  const scale = raw.indexOf(Buffer.from('2ad7b1830f4240', 'hex')),
    info = raw.indexOf(Buffer.from('1549a966', 'hex'));
  expect(scale).toBeGreaterThan(0);
  const long = Buffer.concat([
    raw.subarray(0, scale),
    Buffer.from('2ad7b1843b9aca00', 'hex'),
    raw.subarray(scale + 7),
  ]);
  long[info + 4]++;
  await expect(validateVoice(long, 'audio/webm')).rejects.toThrow('voiceDuration');
});
