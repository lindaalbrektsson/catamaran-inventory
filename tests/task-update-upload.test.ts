import { beforeEach, it, expect, vi } from 'vitest';
const m = vi.hoisted(() => ({ prepare: vi.fn(), finish: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/task-update-actions', () => ({
  prepareTaskUpdate: m.prepare,
  finishTaskUpdate: m.finish,
}));
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ storage: { from: () => ({ upload: m.upload }) } }),
}));
import { addTaskUpdate } from '@/lib/task-update-upload';
beforeEach(() => {
  vi.clearAllMocks();
  m.prepare.mockResolvedValue({});
  m.finish.mockResolvedValue({});
  m.upload.mockResolvedValue({ error: null });
});
function form() {
  const f = new FormData();
  f.set('id', '50000000-0000-4000-8000-000000000001');
  f.set('task', '50000000-0000-4000-8000-000000000002');
  f.set('body', '');
  f.set('duration', '1');
  f.set('voice', new File(['fixture'], 'arbitrary-name.webm', { type: 'audio/webm;codecs=opus' }));
  return f;
}
it('voice bytes use generated private path; only metadata crosses server action', async () => {
  expect(await addTaskUpdate({}, form())).toEqual({});
  expect(m.prepare.mock.calls[0][0].voice).toBeUndefined();
  expect(m.prepare.mock.calls[0][2]).toMatchObject({
    content_type: 'audio/webm',
    duration: 1,
    byte_size: 7,
  });
  expect(m.upload).toHaveBeenCalledWith(
    '50000000-0000-4000-8000-000000000001/voice',
    expect.any(File),
    expect.objectContaining({ upsert: false }),
  );
  expect(m.finish).toHaveBeenCalled();
});
it('photo + voice upload together and failed reservation prevents any upload', async () => {
  const f = form();
  f.set('photo', new File(['photo'], 'a.png', { type: 'image/png' }));
  await addTaskUpdate({}, f);
  expect(m.upload).toHaveBeenCalledTimes(2);
  vi.clearAllMocks();
  m.prepare.mockResolvedValue({ error: 'FORBIDDEN' });
  expect(await addTaskUpdate({}, f)).toEqual({ error: 'FORBIDDEN' });
  expect(m.upload).not.toHaveBeenCalled();
});
it('invalid MIME and oversized voice are rejected before reservation', async () => {
  const f = form();
  f.set('voice', new File(['bad'], 'x', { type: 'text/html' }));
  expect(await addTaskUpdate({}, f)).toEqual({ error: 'voiceInvalid' });
  f.set('voice', new File([new Uint8Array(5242881)], 'x', { type: 'audio/mp4' }));
  expect(await addTaskUpdate({}, f)).toEqual({ error: 'voiceSize' });
  expect(m.prepare).not.toHaveBeenCalled();
});
it('retry checks immutable already-uploaded object through server completion', async () => {
  m.upload.mockResolvedValue({ error: { message: 'already exists' } });
  expect(await addTaskUpdate({}, form())).toEqual({});
  expect(m.finish).toHaveBeenCalledTimes(1);
});
