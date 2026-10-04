import { z } from 'zod';
import { RISK_LEVELS, APPROVAL_STAGES } from '../config/constants.js';
import { uuid, dateStr, idParam, idParams, pagination, nonEmpty } from './common.js';

const factor = z.number().int().min(1).max(4);

const base = z.object({
  name: z.string().trim().min(2).max(100),
  code_prefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, 'Prefix must be 2-6 letters'),
  vendor: z.string().trim().max(100).optional(),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(50).optional(),
  version: z.string().trim().max(30).optional(),
  license_type: z.enum(['subscription', 'perpetual', 'seat', 'usage']).optional(),
  risk_level: z.enum(RISK_LEVELS).optional(),
  data_sensitivity: factor.optional(),
  access_privilege: factor.optional(),
  business_criticality: factor.optional(),
  financial_impact: factor.optional(),
  external_access: factor.optional(),
  cost_per_license: z.number().min(0).optional(),
  billing_cycle: z.enum(['monthly', 'quarterly', 'yearly', 'one_time']).optional(),
  renewal_date: dateStr.nullable().optional(),
  is_active: z.boolean().optional(),
  department_ids: z.array(uuid).optional(),
  access_levels: z.array(z.string().trim().min(1).max(50)).optional(),
});

export const createSoftwareSchema = z.object({ body: base.omit({ is_active: true }) });

export const updateSoftwareSchema = z.object({
  params: idParam,
  body: base.omit({ code_prefix: true, access_levels: true }).partial().refine(nonEmpty, 'Nothing to update'),
});

export const listSoftwareSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    vendor: z.string().optional(),
    risk_level: z.enum(RISK_LEVELS).optional(),
    availability: z.enum(['in_stock', 'low', 'out']).optional(),
    department_id: uuid.optional(),
    status: z.enum(['active', 'inactive', 'all']).optional(),
    ...pagination,
  }),
});

export const riskPreviewSchema = z.object({
  body: z.object({
    data_sensitivity: factor, access_privilege: factor, business_criticality: factor,
    financial_impact: factor, external_access: factor,
  }),
});

export const accessLevelSchema = z.object({
  params: idParam,
  body: z.object({ name: z.string().trim().min(1).max(50) }),
});

export const removeAccessLevelSchema = z.object({
  params: z.object({ id: uuid, levelId: uuid }),
});

export const setDepartmentsSchema = z.object({
  params: idParam,
  body: z.object({ department_ids: z.array(uuid) }),
});

export const policyUpdateSchema = z.object({
  params: z.object({ risk: z.enum(RISK_LEVELS) }),
  body: z.object({
    stages: z.array(z.enum(APPROVAL_STAGES)).min(1).max(3)
      .refine((s) => new Set(s).size === s.length, 'Stages must be unique'),
  }),
});

export { idParams };
