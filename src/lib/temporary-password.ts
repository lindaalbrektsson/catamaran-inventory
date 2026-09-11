import 'server-only';
import { randomInt } from 'node:crypto';
export function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return (
    'Cat-' +
    Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join(''),
    ).join('-')
  );
}
