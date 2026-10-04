import { supabase } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { throwIfError } from '../utils/dbError.js';
import { todayStr } from '../utils/dates.js';
import { REVOKE_REASONS } from '../config/constants.js';
import { audit } from './auditService.js';
import { notifications } from './notificationService.js';
import { checkLowStock } from './inventoryService.js';
import { processWaitlist } from './waitlistService.js';

/** Manual assignment by IT. High/critical software must go through an approved request. */
export async function assignDirect({ licenseId, userId, expiresAt = null, requestId = null, actorId }) {
  const { data: license } = await supabase
    .from('licenses')
    .select('id, license_code, status, expiry_date, software_id, software:software_id(id, name, risk_level)')
    .eq('id', licenseId)
    .maybeSingle();
  if (!license) throw new AppError('License not found', 404);
  if (license.status !== 'available') throw new AppError(`License is ${license.status}, not available`, 409);
  if (license.expiry_date && license.expiry_date <= todayStr()) throw new AppError('License has expired', 409);
  if (expiresAt && expiresAt < todayStr()) throw new AppError('expires_at cannot be in the past', 400);

  const { data: user } = await supabase
    .from('profiles').select('id, full_name, is_active').eq('id', userId).maybeSingle();
  if (!user || !user.is_active) throw new AppError('Target user not found or inactive', 400);

  let request = null;
  if (requestId) {
    const { data } = await supabase
      .from('access_requests')
      .select('id, request_no, requester_id, software_id, status, end_date')
      .eq('id', requestId).maybeSingle();
    request = data;
    if (!request) throw new AppError('Request not found', 404);
    if (request.requester_id !== userId || request.software_id !== license.software_id) {
      throw new AppError('Request does not match this user/software', 400);
    }
    if (!['waiting_for_license', 'it_approved'].includes(request.status)) {
      throw new AppError(`Request is ${request.status}; it must be fully approved first`, 409);
    }
  } else if (['high', 'critical'].includes(license.software.risk_level)) {
    throw new AppError('High/critical-risk software can only be assigned against an approved request', 403);
  }

  // Atomic claim: only one caller can flip available -> assigned
  const { data: claimed, error: claimErr } = await supabase
    .from('licenses').update({ status: 'assigned' })
    .eq('id', licenseId).eq('status', 'available').select('id').maybeSingle();
  throwIfError(claimErr, 'Could not claim license');
  if (!claimed) throw new AppError('License was just taken by another action', 409);

  const { data: assignment, error } = await supabase
    .from('license_assignments')
    .insert({
      license_id: licenseId,
      user_id: userId,
      request_id: requestId,
      assigned_by: actorId,
      expires_at: expiresAt ?? request?.end_date ?? null,
    })
    .select().single();
  if (error) {
    await supabase.from('licenses').update({ status: 'available' }).eq('id', licenseId); // roll back
    throwIfError(error, 'Could not create assignment');
  }

  if (request) {
    await supabase.from('access_requests')
      .update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', request.id);
  }

  await notifications.notify(userId, `✅ License ${license.license_code} for ${license.software.name} has been assigned to you.`, '/my-licenses');
  await audit.log({
    actorId, action: 'license_assigned', entityType: 'license', entityId: licenseId,
    details: { license: license.license_code, software: license.software.name, user: userId, request: request?.request_no ?? null, manual: true },
  });
  await checkLowStock(license.software_id);
  return { assignment, license_code: license.license_code };
}

/** Revokes the active assignment on a license, releases it, then serves the waitlist. */
export async function revokeLicense({ licenseId, reason, notes = '', actorId }) {
  const { data: assignment } = await supabase
    .from('license_assignments')
    .select('id, user_id, license:licenses(software_id, license_code)')
    .eq('license_id', licenseId).is('revoked_at', null).maybeSingle();
  if (!assignment) throw new AppError('This license has no active assignment', 409);

  const text = notes ? `${REVOKE_REASONS[reason]}: ${notes}` : REVOKE_REASONS[reason];
  const { error } = await supabase.rpc('revoke_license', {
    p_assignment: assignment.id, p_reason: text, p_actor: actorId,
  });
  throwIfError(error, 'Could not revoke license');

  const fulfilled = await processWaitlist(assignment.license.software_id, actorId);
  return { assignment_id: assignment.id, license_code: assignment.license.license_code, waitlist_fulfilled: fulfilled };
}

/** Used by offboarding: revoke everything a user holds. */
export async function revokeAllForUser({ userId, reason = 'resigned', notes = '', actorId }) {
  const { data: active, error } = await supabase
    .from('license_assignments').select('license_id').eq('user_id', userId).is('revoked_at', null);
  throwIfError(error, 'Could not load assignments');
  const results = [];
  for (const a of active || []) {
    results.push(await revokeLicense({ licenseId: a.license_id, reason, notes, actorId }));
  }
  return results;
}
