import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { throwIfError } from '../utils/dbError.js';
import { todayStr } from '../utils/dates.js';
import { notifications } from './notificationService.js';

/** Licenses that can be handed out right now (available and not past expiry). */
export async function getAvailableCount(softwareId) {
  const { count, error } = await supabase
    .from('licenses')
    .select('id', { count: 'exact', head: true })
    .eq('software_id', softwareId)
    .eq('status', 'available')
    .or(`expiry_date.is.null,expiry_date.gt.${todayStr()}`);
  throwIfError(error, 'Could not count licenses');
  return count ?? 0;
}

/** Fires once as stock crosses the low-stock threshold, and again at zero. */
export async function checkLowStock(softwareId) {
  const available = await getAvailableCount(softwareId);
  if (available !== 0 && available !== env.lowStockThreshold) return;

  const { data: sw } = await supabase.from('software').select('name').eq('id', softwareId).single();
  const name = sw?.name ?? 'Software';
  await notifications.notifyRoles(
    ['it_admin', 'super_admin'],
    available === 0
      ? `⚠️ ${name} has no licenses left. New requests will be waitlisted.`
      : `⚠️ ${name} has only ${available} licenses remaining.`,
    '/admin/software'
  );
}
