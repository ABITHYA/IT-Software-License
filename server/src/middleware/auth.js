import { supabase } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const PROFILE_FIELDS =
  'id, full_name, email, employee_id, department_id, role, job_title, manager_id, is_active';

/**
 * Verifies the Supabase JWT, loads the profile, blocks inactive accounts,
 * and attaches the profile to req.user.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Authentication required', 401);
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new AppError('Invalid or expired token', 401);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile) throw new AppError('User profile not found', 403);
  if (!profile.is_active) throw new AppError('Account is inactive', 403);

  req.user = profile;
  next();
});
