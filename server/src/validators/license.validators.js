import { z } from 'zod';
import { REVOKE_REASONS } from '../config/constants.js';
import { uuid, dateStr, idParam, pagination } from './common.js';

const LICENSE_STATUSES = ['available', 'reserved', 'assigned', 'suspended', 'expired', 'revoked'];

export const listLicensesSchema = z.object({
  query: z.object({
    software_id: uuid.optional(),
    status: z.enum(LICENSE_STATUSES).optional(),
    search: z.string().optional(),
    assigned_to: uuid.optional(),
    expiring_within: z.coerce.number().int().min(1).max(365).optional(),
    ...pagination,
  }),
});

export const createLicenseSchema = z.object({
  body: z.object({
    software_id: uuid,
    license_key: z.string().trim().max(200).optional(),
    purchase_date: dateStr.optional(),
    expiry_date: dateStr.optional(),
    cost: z.number().min(0).optional(),
  }),
});

export const bulkLicenseSchema = z.object({
  body: z.object({
    software_id: uuid,
    count: z.number().int().min(1).max(500),
    purchase_date: dateStr.optional(),
    expiry_date: dateStr.optional(),
    cost: z.number().min(0).optional(),
  }),
});

export const licenseStatusSchema = z.object({
  params: idParam,
  body: z.object({
    status: z.enum(['available', 'suspended', 'expired']),
    expiry_date: dateStr.optional(), // pass a new date to renew
  }),
});

export const assignLicenseSchema = z.object({
  params: idParam,
  body: z.object({
    user_id: uuid,
    expires_at: dateStr.optional(),
    request_id: uuid.optional(),
  }),
});

export const revokeLicenseSchema = z.object({
  params: idParam,
  body: z.object({
    reason: z.enum(Object.keys(REVOKE_REASONS)),
    notes: z.string().trim().max(500).optional(),
  }),
});
