import { z } from 'zod';
export const phoneCountries = ['501', '57', '46'] as const;
export function phoneIdentity(country: string, number: string) {
  if (!phoneCountries.includes(country as (typeof phoneCountries)[number])) return null;
  const digits = number.replace(/[ ()-]/g, '');
  const valid = country === '501' ? /^\d{7}$/ : country === '57' ? /^\d{10}$/ : /^\d{7,10}$/;
  if (!valid.test(digits) || digits.startsWith('0')) return null;
  return `+${country}${digits}`;
}
export const newPasswordSchema = z
  .object({ password: z.string().min(12).max(128), confirm: z.string() })
  .refine((v) => v.password === v.confirm);
export function loginCredentials(form: FormData) {
  const password = form.get('password');
  if (typeof password !== 'string' || !password || password.length > 1024) return null;
  if (form.get('method') === 'phone') {
    const phone = phoneIdentity(String(form.get('country') ?? ''), String(form.get('phone') ?? ''));
    return phone ? { phone, password } : null;
  }
  return null;
}
