import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from './password-config.mjs';
export { PASSWORD_MIN_LENGTH };
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH);
