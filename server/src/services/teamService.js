import { supabase } from '../config/supabase.js';
import { throwIfError } from '../utils/dbError.js';

export async function getTeamIds(managerId) {
  const { data, error } = await supabase.from('profiles').select('id').eq('manager_id', managerId);
  throwIfError(error, 'Could not load team');
  return (data || []).map((r) => r.id);
}
