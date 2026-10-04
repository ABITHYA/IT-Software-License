import { z } from 'zod';

export const updateMeSchema = z.object({
  body: z
    .object({
      full_name: z.string().trim().min(2).max(100).optional(),
      job_title: z.string().trim().max(100).optional(),
    })
    .strict() // rejects unknown fields such as "role"
    .refine((b) => Object.keys(b).length > 0, { message: 'Provide at least one field to update' }),
});
