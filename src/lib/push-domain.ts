import { z } from 'zod';
export const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(2048)
    .url()
    .refine((v) => {
      const u = new URL(v);
      return (
        u.protocol === 'https:' &&
        !u.port &&
        !u.username &&
        !u.password &&
        !u.hash &&
        /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/.test(
          u.hostname,
        )
      );
    }),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});
