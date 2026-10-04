import { z } from 'zod';

export const uuid = z.string().uuid();
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const idParam = z.object({ id: uuid });
export const idParams = z.object({ params: idParam });
export const pagination = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};
export const nonEmpty = (o) => Object.keys(o).length > 0;
