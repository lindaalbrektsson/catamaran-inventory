import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffprobe from '@ffprobe-installer/ffprobe';
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from './voice-domain';
const exec = promisify(execFile);
export async function validateVoice(bytes: Uint8Array, mime: string): Promise<number> {
  if (!bytes.length || bytes.length > VOICE_MAX_BYTES) throw new Error('voiceSize');
  const b = Buffer.from(bytes);
  if (
    !(mime === 'audio/mp4' && b.subarray(4, 8).toString() === 'ftyp') &&
    !(mime === 'audio/webm' && b.subarray(0, 4).toString('hex') === '1a45dfa3') &&
    !(mime === 'audio/ogg' && b.subarray(0, 4).toString() === 'OggS')
  )
    throw new Error('voiceInvalid');
  const dir = await mkdtemp(join(tmpdir(), 'cat-voice-'));
  try {
    const path = join(dir, 'recording');
    await writeFile(path, b, { mode: 0o600 });
    const { stdout } = await exec(
      ffprobe.path,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-format_whitelist',
        'mov,matroska,webm,ogg',
        '-show_entries',
        'stream=codec_type,codec_name,channels:format=duration,format_name:packet=pts_time,duration_time',
        '-of',
        'json',
        path,
      ],
      { timeout: 10000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
    );
    const data = JSON.parse(stdout) as {
      streams?: { codec_type: string; codec_name: string; channels: number }[];
      format?: { duration?: string; format_name?: string };
      packets?: { pts_time?: string; duration_time?: string }[];
    };
    const streams = data.streams ?? [];
    if (
      streams.length !== 1 ||
      streams[0].codec_type !== 'audio' ||
      streams[0].channels < 1 ||
      streams[0].channels > 2 ||
      streams[0].codec_name !== (mime === 'audio/mp4' ? 'aac' : 'opus')
    )
      throw new Error('voiceInvalid');
    const format = data.format?.format_name ?? '';
    if (
      !(mime === 'audio/mp4'
        ? format.includes('mov')
        : mime === 'audio/webm'
          ? format.includes('matroska')
          : format === 'ogg')
    )
      throw new Error('voiceInvalid');
    const packets = data.packets ?? [];
    if (!packets.length) throw new Error('voiceInvalid');
    let end = 0,
      start = 0;
    for (const p of packets) {
      const at = Number(p.pts_time),
        d = Number(p.duration_time ?? 0);
      if (!Number.isFinite(at) || !Number.isFinite(d) || at < -1 || d < 0)
        throw new Error('voiceInvalid');
      start = Math.min(start, at);
      end = Math.max(end, at + d);
    }
    const duration = Math.max(end - start, Number(data.format?.duration) || 0);
    if (!Number.isFinite(duration) || duration > VOICE_MAX_SECONDS)
      throw new Error('voiceDuration');
    if (duration < 0.01) throw new Error('voiceInvalid');
    return Math.ceil(duration * 1000) / 1000;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
