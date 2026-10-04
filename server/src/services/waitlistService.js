import { supabase } from '../config/supabase.js';
import { getAvailableCount } from './inventoryService.js';
import { notifications } from './notificationService.js';

/**
 * Hands freed licenses to waiting requests: emergency first, then oldest first.
 * Call after any revoke, release, expiry or newly added/renewed license.
 * Returns how many requests were fulfilled.
 */
export async function processWaitlist(softwareId, actorId = null) {
  let fulfilled = 0;

  for (let i = 0; i < 50; i += 1) {
    if ((await getAvailableCount(softwareId)) === 0) break;

    const { data: next } = await supabase
      .from('access_requests')
      .select('id, request_no, requester_id')
      .eq('software_id', softwareId)
      .eq('status', 'waiting_for_license')
      .order('is_emergency', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!next) break;

    const { data: result, error } = await supabase.rpc('assign_license', {
      p_request: next.id,
      p_actor: actorId,
    });
    if (error) {
      console.error('Waitlist assignment failed:', error.message);
      break;
    }
    if (result === 'waitlisted') break;

    fulfilled += 1;
    await notifications.notify(
      next.requester_id,
      `🔔 A license is now available for your request ${next.request_no}.`,
      '/my-licenses'
    );
  }
  return fulfilled;
}
