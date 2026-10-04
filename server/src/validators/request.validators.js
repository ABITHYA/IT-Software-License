import { z } from 'zod';
import { PRIORITIES, RISK_LEVELS } from '../config/constants.js';
import { uuid, dateStr, idParam, pagination } from './common.js';
import { todayStr } from '../utils/dates.js';

export const createRequestSchema = z.object({
  body: z
    .object({
      software_id: uuid,
      access_level_id: uuid.optional(),
      justification: z.string().trim().min(10, 'Please explain the business need (min 10 chars)').max(1000),
      priority: z.enum(PRIORITIES).default('medium'),
      project: z.string().trim().max(100).optional(),
      department_id: uuid.optional(),
      start_date: dateStr.optional(),
      end_date: dateStr.optional(),
      is_emergency: z.boolean().default(false),
      comments: z.string().trim().max(1000).optional(),
    })
    .refine((b) => !b.start_date || !b.end_date || b.end_date >= b.start_date, {
      message: 'end_date must be on or after start_date', path: ['end_date'],
    })
    .refine((b) => !b.end_date || b.end_date >= todayStr(), {
      message: 'end_date cannot be in the past', path: ['end_date'],
    }),
});

export const listRequestsSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    priority: z.enum(PRIORITIES).optional(),
    software_id: uuid.optional(),
    department_id: uuid.optional(),
    requester_id: uuid.optional(),
    risk: z.enum(RISK_LEVELS).optional(),
    search: z.string().optional(),
    from_date: dateStr.optional(),
    to_date: dateStr.optional(),
    mine: z.enum(['true', 'false']).optional(),
    ...pagination,
  }),
});

export const approveSchema = z.object({
  params: idParam,
  body: z.object({ comments: z.string().trim().max(500).optional() }),
});

export const rejectSchema = z.object({
  params: idParam,
  body: z.object({ comments: z.string().trim().min(3, 'A rejection reason is required').max(500) }),
});
