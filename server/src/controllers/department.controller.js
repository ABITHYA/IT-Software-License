import { supabase } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { throwIfError } from '../utils/dbError.js';
import { audit } from '../services/auditService.js';

export const listDepartments = asyncHandler(async (_req, res) => {
  const { data, error } = await supabase.from('departments').select('*').order('name');
  throwIfError(error);
  res.json({ success: true, data });
});

export const createDepartment = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('departments').insert(req.body).select().single();
  throwIfError(error, 'Could not create department');
  await audit.log({ actorId: req.user.id, action: 'department_created', entityType: 'department', entityId: data.id, details: req.body });
  res.status(201).json({ success: true, data });
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('departments').update(req.body).eq('id', req.params.id).select().maybeSingle();
  throwIfError(error, 'Could not update department');
  if (!data) throw new AppError('Department not found', 404);
  await audit.log({ actorId: req.user.id, action: 'department_updated', entityType: 'department', entityId: data.id, details: req.body });
  res.json({ success: true, data });
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  const { error } = await supabase.from('departments').delete().eq('id', req.params.id);
  throwIfError(error, 'Could not delete department'); // 409 if employees still belong to it
  await audit.log({ actorId: req.user.id, action: 'department_deleted', entityType: 'department', entityId: req.params.id });
  res.json({ success: true, message: 'Department deleted' });
});
