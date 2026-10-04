import { supabase } from '../config/supabase.js';
import { ADMIN_ROLES } from '../config/constants.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { throwIfError } from '../utils/dbError.js';
import { addDays, daysUntil, todayStr } from '../utils/dates.js';
import { parsePagination, pageMeta, sanitizeSearch } from '../utils/pagination.js';
import { audit } from '../services/auditService.js';
import { assignDirect, revokeLicense } from '../services/licenseService.js';
import { processWaitlist } from '../services/waitlistService.js';

const mask = (key) => (key ? `${'*'.repeat(Math.max(0, key.length - 4))}${key.slice(-4)}` : null);

// Generates FIG-001, FIG-002 ... continuing after the highest existing number
async function nextCodes(software, n) {
  const re = new RegExp(`^${software.code_prefix}-(\\d+)$`);
  let max = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('licenses').select('license_code').eq('software_id', software.id).range(from, from + 999);
    throwIfError(error, 'Could not read existing licenses');
    for (const r of data) {
      const m = re.exec(r.license_code);
      if (m) max = Math.max(max, Number(m[1]));
    }
    if (data.length < 1000) break;
  }
  return Array.from({ length: n }, (_, i) => `${software.code_prefix}-${String(max + i + 1).padStart(3, '0')}`);
}

const getSoftware = async (id) => {
  const { data } = await supabase.from('software').select('id, name, code_prefix, cost_per_license').eq('id', id).maybeSingle();
  if (!data) throw new AppError('Software not found', 404);
  return data;
};

const insertLicenses = async (software, body, count, actorId) => {
  const codes = await nextCodes(software, count);
  const rows = codes.map((license_code) => ({
    license_code,
    software_id: software.id,
    license_key: body.license_key ?? null,
    purchase_date: body.purchase_date ?? null,
    expiry_date: body.expiry_date ?? null,
    cost: body.cost ?? software.cost_per_license ?? 0,
  }));
  const { data, error } = await supabase.from('licenses').insert(rows).select('id, license_code, status');
  throwIfError(error, 'Could not create licenses');

  await audit.log({
    actorId, action: 'licenses_added', entityType: 'software', entityId: software.id,
    details: { software: software.name, count, from: codes[0], to: codes[codes.length - 1] },
  });
  await processWaitlist(software.id, actorId); // new stock may unblock waiting requests
  return data;
};

// GET /api/licenses
export const listLicenses = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query);
  const { software_id, status, search, assigned_to, expiring_within } = req.query;

  const embed =
    `assignments:license_assignments${assigned_to ? '!inner' : ''}` +
    '(id, user_id, assigned_at, expires_at, last_activity_at, revoked_at, user:profiles!user_id(id, full_name, email))';
  let q = supabase
    .from('licenses')
    .select(`*, software:software_id(id, name, code_prefix), ${embed}`, { count: 'exact' })
    .is('assignments.revoked_at', null);

  if (assigned_to) q = q.eq('assignments.user_id', assigned_to);
  if (software_id) q = q.eq('software_id', software_id);
  if (status) q = q.eq('status', status);
  if (search) {
    const s = sanitizeSearch(search);
    if (s) q = q.ilike('license_code', `%${s}%`);
  }
  if (expiring_within) {
    q = q.not('expiry_date', 'is', null).gte('expiry_date', todayStr()).lte('expiry_date', addDays(expiring_within));
  }

  const { data, count, error } = await q.order('license_code').range(from, to);
  throwIfError(error, 'Could not load licenses');

  const rows = data.map(({ assignments, license_key, ...l }) => ({
    ...l,
    license_key: mask(license_key),
    current_assignment: assignments?.[0] ?? null,
    assigned_to: assignments?.[0]?.user ?? null,
    days_to_expiry: daysUntil(l.expiry_date),
  }));
  res.json({ success: true, data: rows, meta: pageMeta(count, page, limit) });
});

// GET /api/licenses/mine   (any logged-in user: their own licenses)
export const myLicenses = asyncHandler(async (req, res) => {
  let q = supabase
    .from('license_assignments')
    .select('id, assigned_at, expires_at, last_activity_at, revoked_at, revoke_reason, request_id, license:licenses(license_code, software:software_id(id, name, vendor, category, risk_level))')
    .eq('user_id', req.user.id)
    .order('assigned_at', { ascending: false });
  if (req.query.history !== 'true') q = q.is('revoked_at', null);

  const { data, error } = await q;
  throwIfError(error, 'Could not load your licenses');
  res.json({
    success: true,
    data: data.map((a) => ({ ...a, days_to_expiry: daysUntil(a.expires_at) })),
  });
});

// GET /api/licenses/:id   (full detail with unmasked key + assignment history)
export const getLicense = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('licenses')
    .select('*, software:software_id(id, name, code_prefix), history:license_assignments(id, assigned_at, expires_at, revoked_at, revoke_reason, last_activity_at, user:profiles!user_id(id, full_name, email))')
    .eq('id', req.params.id).maybeSingle();
  throwIfError(error);
  if (!data) throw new AppError('License not found', 404);
  data.history.sort((a, b) => new Date(b.assigned_at) - new Date(a.assigned_at));
  res.json({ success: true, data });
});

// POST /api/licenses
export const createLicense = asyncHandler(async (req, res) => {
  const software = await getSoftware(req.body.software_id);
  const [created] = await insertLicenses(software, req.body, 1, req.user.id);
  res.status(201).json({ success: true, data: created });
});

// POST /api/licenses/bulk
export const bulkCreateLicenses = asyncHandler(async (req, res) => {
  const software = await getSoftware(req.body.software_id);
  const created = await insertLicenses(software, req.body, req.body.count, req.user.id);
  res.status(201).json({ success: true, message: `${created.length} licenses created`, data: created });
});

// PATCH /api/licenses/:id/status   (suspend / expire / reinstate / renew)
export const updateLicenseStatus = asyncHandler(async (req, res) => {
  const { data: lic } = await supabase.from('licenses').select('*').eq('id', req.params.id).maybeSingle();
  if (!lic) throw new AppError('License not found', 404);
  if (lic.status === 'assigned') throw new AppError('License is assigned. Revoke it first.', 409);

  const { status, expiry_date } = req.body;
  const newExpiry = expiry_date ?? lic.expiry_date;
  if (status === 'available' && newExpiry && newExpiry <= todayStr()) {
    throw new AppError('License is past its expiry date. Provide a new expiry_date to renew it.', 400);
  }

  const { data, error } = await supabase
    .from('licenses').update({ status, expiry_date: newExpiry }).eq('id', lic.id).select().single();
  throwIfError(error, 'Could not update license');

  await audit.log({
    actorId: req.user.id, action: 'license_status_changed', entityType: 'license', entityId: lic.id,
    details: { license: lic.license_code, from: lic.status, to: status, expiry_date: newExpiry },
  });
  if (status === 'available') await processWaitlist(lic.software_id, req.user.id);
  res.json({ success: true, data });
});

// PATCH /api/licenses/:id/assign
export const assignLicense = asyncHandler(async (req, res) => {
  const result = await assignDirect({
    licenseId: req.params.id,
    userId: req.body.user_id,
    expiresAt: req.body.expires_at ?? null,
    requestId: req.body.request_id ?? null,
    actorId: req.user.id,
  });
  res.json({ success: true, data: result });
});

// PATCH /api/licenses/:id/revoke
export const revoke = asyncHandler(async (req, res) => {
  const result = await revokeLicense({
    licenseId: req.params.id, reason: req.body.reason, notes: req.body.notes, actorId: req.user.id,
  });
  res.json({
    success: true,
    message: `License ${result.license_code} revoked and released to the pool.`,
    data: result,
  });
});

// POST /api/licenses/:id/activity  (usage heartbeat for unused-license detection)
export const recordActivity = asyncHandler(async (req, res) => {
  const { data: a } = await supabase
    .from('license_assignments').select('id, user_id').eq('license_id', req.params.id).is('revoked_at', null).maybeSingle();
  if (!a) throw new AppError('No active assignment for this license', 404);
  if (a.user_id !== req.user.id && !ADMIN_ROLES.includes(req.user.role)) {
    throw new AppError('You can only record activity on your own license', 403);
  }
  const { error } = await supabase
    .from('license_assignments').update({ last_activity_at: new Date().toISOString() }).eq('id', a.id);
  throwIfError(error);
  res.json({ success: true });
});
