import { z } from 'zod';
export function normalizedName(name: string) {
  return name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
export const quickAddSchema = z
  .object({
    requestId: z.uuid(),
    location: z.uuid(),
    product: z.uuid().or(z.literal('')),
    name: z.string().trim().max(150),
    category: z.uuid().or(z.literal('')),
    quantity: z
      .string()
      .transform((v) => v.replace(',', '.'))
      .pipe(z.string().regex(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/))
      .refine((v) => Number(v) > 0),
    confirmDuplicate: z.boolean(),
  })
  .refine((v) => !!v.product || (!!v.name && !!v.category));
export const needSchema = z.object({
  requestId: z.uuid(),
  id: z.uuid(),
  version: z.coerce.number().int().min(0),
  name: z.string().trim().min(1).max(150),
  product_id: z.uuid().or(z.literal('')),
  location_id: z.uuid().or(z.literal('')),
  country: z.enum(['BELIZE', 'USA']),
  status: z.enum(['PENDING', 'ORDERED', 'DONE']),
  product_url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => !v || (/^https?:\/\//.test(v) && z.url().safeParse(v).success)),
  comment: z.string().max(2000),
  confirmDuplicate: z.boolean(),
});
