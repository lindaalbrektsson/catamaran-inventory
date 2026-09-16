import { z } from 'zod';
import { passwordSchema } from './password-policy';
export const phoneCountries = ['501', '57', '46'] as const;
export function phoneIdentity(country: string, number: string) {
  if (!phoneCountries.includes(country as (typeof phoneCountries)[number])) return null;
  const digits = number.replace(/[ ()-]/g, '');
  const valid = country === '501' ? /^\d{7}$/ : country === '57' ? /^\d{10}$/ : /^\d{7,10}$/;
  if (!valid.test(digits) || digits.startsWith('0')) return null;
  return `+${country}${digits}`;
}
export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{1,40}$/);
export function loginCredentials(form: FormData) {
  const username = usernameSchema.safeParse(form.get('username'));
  const password = form.get('password');
  if (!username.success || typeof password !== 'string' || !password || password.length > 1024)
    return null;
  return { username: username.data, password };
}
