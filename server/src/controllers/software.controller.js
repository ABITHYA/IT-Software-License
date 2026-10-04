import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { ADMIN_ROLES } from '../config/constants.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { throwIfError } from '../utils/dbError.js';
import { parsePagination, pageMeta, sanitizeSearch } from '../utils/pagination.js';
import { audit } from '../services/auditService.js';
import { calculateRisk, pickFactors, RISK_FACTORS } from '../services/riskService.js';

const isAdmin = (u) => ADMIN_ROLES.includes(u.role);
const canSeeCost = (u) => isAdmin(u) || u.role === 'security_admin';

// Adds stock status + utilisation, hides cost from regular employees
const shape = (row, user) => {
  const out = {
    ...row,
    stock_status:
      row.available_licenses === 0 ? 'out_of_stock'
      : row.available_licenses <= env.lowStockThreshold ? 'low_stock' : 'in_stock',
    utilization_pct: row.total_licenses ? Math.round((row.assigned_licenses / row.total_licenses) * 100) : 0,
  };
  if (!canSeeCost(user)) delete out.cost_per_license;
  return out;
};

async function replaceDepartments(softwareId, ids) {
  const { error: delErr } = await supabase.from('software_departments').delete().eq('software_id', softwareId);
  throwIfError(delErr);
  if (ids.length) {
    const { error } = await supabase
      .from('software_departments')
      .insert(ids.map((department_id) => ({ software_id: softwareId, department_id })));
    throwIfError(error, 'Invalid department');
  }
}

const getRaw = async (id) => {
  const { data, error } = await supabase.from('software').select('*').eq('id', id).maybeSingle();
  throwIfError(error);
  if (!data) throw new AppError('Software not found', 404);
  return data;
};

// GET /api/software
export const listSoftware = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = parsePagination(req.query);
  const { search, category, vendor, risk_level, availability, department_id } = req.query;
  const status = isAdmin(req.user) ? req.query.status || 'active' : 'active';

  let q = supabase.from('software_inventory').select('*', { count: 'exact' });
  if (status !== 'all') q = q.eq('is_active', status === 'active');
  if (category) q = q.eq('category', category);
  if (vendor) q = q.eq('vendor', vendor);
  if (risk_level) q = q.eq('risk_level', risk_level);
  if (availability === 'out') q = q.eq('available_licenses', 0);
  if (availability === 'in_stock') q = q.gt('available_licenses', 0);
  if (availability === 'low') q = q.gt('available_licenses', 0).lte('available_licenses', env.lowStockThreshold);
  if (search) {
    const s = sanitizeSearch(search);
    if (s) q = q.or(`name.ilike.%${s}%,vendor.ilike.%${s}%`);
  }

  if (department_id) {
    // Software explicitly linked to the department, or not restricted to any department
    const { data: links } = await supabase.from('software_departments').select('software_id, department_id');
    const restricted = [...new Set((links || []).map((l) => l.software_id))];
    const allowed = (links || []).filter((l) => l.department_id === department_id).map((l) => l.software_id);
    if (restricted.length) {
      q = allowed.length
        ? q.or(`id.in.(${allowed.join(',')}),id.not.in.(${restricted.join(',')})`)
        : q.not('id', 'in', `(${restricted.join(',')})`);
    }
  }

  const { data, count, error } = await q.order('name').range(from, to);
  throwIfError(error, 'Could not load software');
  res.json({ success: true, data: data.map((r) => shape(r, req.user)), meta: pageMeta(count, page, limit) });
});

// GET /api/software/:id
export const getSoftware = asyncHandler(async (req, res) => {
  const { data: row, error } = await supabase
    .from('software_inventory').select('*').eq('id', req.params.id).maybeSingle();
  throwIfError(error);
  if (!row) throw new AppError('Software not found', 404);

  const [levels, depts] = await Promise.all([
    supabase.from('software_access_levels').select('id, name').eq('software_id', row.id).order('name'),
    supabase.from('software_departments').select('department:departments(id, name)').eq('software_id', row.id),
  ]);
  res.json({
    success: true,
    data: {
      ...shape(row, req.user),
      access_levels: levels.data || [],
      departments: (depts.data || []).map((d) => d.department),
    },
  });
});

// GET /api/software/meta/categories
export const listCategories = asyncHandler(async (_req, res) => {
  const { data, error } = await supabase.from('software').select('category').not('category', 'is', null);
  throwIfError(error);
  res.json({ success: true, data: [...new Set(data.map((r) => r.category))].sort() });
});

// POST /api/software/risk-preview  (live preview while the admin fills the form)
export const riskPreview = asyncHandler(async (req, res) => {
  res.json({ success: true, data: calculateRisk(req.body) });
});

// POST /api/software
export const createSoftware = asyncHandler(async (req, res) => {
  const { department_ids = [], access_levels = [], ...fields } = req.body;

  const given = pickFactors(fields);
  const n = Object.keys(given).length;
  if (n > 0 && n < RISK_FACTORS.length) {
    throw new AppError('Provide all five risk factors, or none', 400);
  }
  const calc = n ? calculateRisk(given) : null;

  const { data, error } = await supabase
    .from('software')
    .insert({ ...fields, risk_level: calc?.level ?? fields.risk_level ?? 'low', risk_score: calc?.score ?? null })
    .select().single();
  throwIfError(error, 'Could not create software');

  try {
    if (access_levels.length) {
      const { error: e } = await supabase.from('software_access_levels')
        .insert([...new Set(access_levels)].map((name) => ({ software_id: data.id, name })));
      throwIfError(e, 'Could not add access levels');
    }
    await replaceDepartments(data.id, department_ids);
  } catch (err) {
    await supabase.from('software').delete().eq('id', data.id); // don't leave a half-created record
    throw err;
  }

  await audit.log({
    actorId: req.user.id, action: 'software_created', entityType: 'software', entityId: data.id,
    details: { name: data.name, risk_level: data.risk_level },
  });
  res.status(201).json({ success: true, data });
});

// PUT /api/software/:id
export const updateSoftware = asyncHandler(async (req, res) => {
  const existing = await getRaw(req.params.id);
  const { department_ids, ...patch } = req.body;
  const updates = { ...patch };

  if (RISK_FACTORS.some((k) => patch[k] !== undefined)) {
    const calc = calculateRisk({ ...pickFactors(existing), ...pickFactors(patch) });
    if (!calc) throw new AppError('All five risk factors must be set to recalculate risk', 400);
    updates.risk_level = calc.level;
    updates.risk_score = calc.score;
  }

  if (Object.keys(updates).length) {
    const { error } = await supabase.from('software').update(updates).eq('id', existing.id);
    throwIfError(error, 'Could not update software');
  }
  if (department_ids) await replaceDepartments(existing.id, department_ids);

  await audit.log({
    actorId: req.user.id, action: 'software_updated', entityType: 'software', entityId: existing.id,
    details: { changes: updates, department_ids },
  });
  if (updates.risk_level && updates.risk_level !== existing.risk_level) {
    await audit.log({
      actorId: req.user.id, action: 'software_risk_changed', entityType: 'software', entityId: existing.id,
      details: { from: existing.risk_level, to: updates.risk_level, note: 'Applies to new requests only' },
    });
  }
  const { data } = await supabase.from('software').select('*').eq('id', existing.id).single();
  res.json({ success: true, data });
});

// DELETE /api/software/:id  (soft: stops new requests, keeps existing assignments)
export const deactivateSoftware = asyncHandler(async (req, res) => {
  const existing = await getRaw(req.params.id);
  const { error } = await supabase.from('software').update({ is_active: false }).eq('id', existing.id);
  throwIfError(error, 'Could not deactivate software');

  const { count } = await supabase.from('licenses')
    .select('id', { count: 'exact', head: true }).eq('software_id', existing.id).eq('status', 'assigned');
  await audit.log({
    actorId: req.user.id, action: 'software_deactivated', entityType: 'software', entityId: existing.id,
    details: { name: existing.name, still_assigned: count ?? 0 },
  });
  res.json({
    success: true,
    message: `${existing.name} deactivated. ${count ?? 0} active license(s) are unchanged; revoke them separately if needed.`,
  });
});

// POST /api/software/:id/access-levels
export const addAccessLevel = asyncHandler(async (req, res) => {
  await getRaw(req.params.id);
  const { data, error } = await supabase.from('software_access_levels')
    .insert({ software_id: req.params.id, name: req.body.name }).select().single();
  throwIfError(error, 'Could not add access level');
  res.status(201).json({ success: true, data });
});

// DELETE /api/software/:id/access-levels/:levelId
export const removeAccessLevel = asyncHandler(async (req, res) => {
  const { error } = await supabase.from('software_access_levels')
    .delete().eq('id', req.params.levelId).eq('software_id', req.params.id);
  throwIfError(error, 'Could not remove access level'); // 409 if existing requests use it
  res.json({ success: true, message: 'Access level removed' });
});

// PUT /api/software/:id/departments
export const setDepartments = asyncHandler(async (req, res) => {
  await getRaw(req.params.id);
  await replaceDepartments(req.params.id, req.body.department_ids);
  await audit.log({
    actorId: req.user.id, action: 'software_departments_updated', entityType: 'software',
    entityId: req.params.id, details: req.body,
  });
  res.json({ success: true, message: 'Department availability updated' });
});
