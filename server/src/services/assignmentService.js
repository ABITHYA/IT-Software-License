import { supabase } from '../config/supabase.js';
import { throwIfError } from '../utils/dbError.js';
import { notifications } from './notificationService.js';
import { checkLowStock } from './inventoryService.js';

export const setStatus = async (id, status) => {
  const { error } = await supabase
    .from('access_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  throwIfError(error, 'Could not update request status');
};

/**
 * Called once every approval step is done (or the policy needs none).
 * Success -> request becomes active. No stock -> request goes to the waitlist.
 * `request` needs: id, request_no, requester_id, software_id, software.name
 */
export async function runAssignment(request, actorId, { markApproved = true } = {}) {
  if (markApproved) await setStatus(request.id, 'approved');

  const { data: result, error } = await supabase.rpc('assign_license', {
    p_request: request.id, p_actor: actorId,
  });
  throwIfError(error, 'License assignment failed');

  if (result === 'waitlisted') {
    await notifications.notify(
      request.requester_id,
      `⏳ Your request ${request.request_no} (${request.software.name}) is approved, but no license is free. You are on the waitlist.`,
      `/requests/${request.id}`
    );
  } else {
    await checkLowStock(request.software_id); // assign_license() already notified the requester
  }
  return result;
}