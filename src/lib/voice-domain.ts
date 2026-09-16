export const VOICE_MAX_BYTES = 5 * 1024 * 1024;
export const VOICE_MAX_SECONDS = 180;
export const VOICE_TYPES = ['audio/mp4', 'audio/webm', 'audio/ogg'] as const;
export const RECORDING_TYPES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
];
export function audioMime(value: string) {
  return value.toLowerCase().split(';')[0].trim();
}
export function voiceTime(seconds: number) {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
