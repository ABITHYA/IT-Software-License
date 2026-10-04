import { supabase } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/auditService.js';

// GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, department:departments(id, name), manager:manager_id(id, full_name, email)')
    .eq('id', req.user.id)
    .single();
  if (error) throw new AppError('Could not load profile', 500);
  res.json({ success: true, data });
});

// PATCH /api/auth/me  (role, department, manager can NOT be changed here)
export const updateMe = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(req.body)
    .eq('id', req.user.id)
    .select()
    .single();
  if (error) throw new AppError('Could not update profile', 500);

  await audit.log({
    actorId: req.user.id,
    action: 'profile_updated',
    entityType: 'profile',
    entityId: req.user.id,
    details: req.body,
  });
  res.json({ success: true, data });
});
