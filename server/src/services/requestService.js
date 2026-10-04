import { supabase } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { throwIfError } from '../utils/dbError.js';
import { addDays } from '../utils/dates.js';
import { canActOnStep, stageForStatus } from '../utils/approvalRules.js';
import { ADMIN_ROLES, OPEN_REQUEST_STATUSES, CANCELLABLE_STATUSES } from '../config/constants.js';
import { parsePagination, pageMeta, sanitizeSearch } from '../utils/pagination.js';
import { audit } from './auditService.js';
import { notifications } from './notificationService.js';
import { getTeamIds } from './teamService.js';

export const REQUEST_SELECT = [
  '*',
  'requester:profiles!requester_id(id, full_name, email, department_id, manager_id)',
  'software:software_id(id, name, vendor, category, risk_level)',
  'access_level:access_level_id(id, name)',
  'department:department_id(id, name)',
  'approvals:request_approvals(id, stage, seq, decision, comments, decided_at, approver:profiles!approver_id(id, full_name))',
].join(', ');

const sortApprovals = (r) => {
  if (r?.approvals) r.approvals.sort((a, b) => a.seq - b.seq);
  return r;
};

export async function fetchRequest(id) {
  const { data, error } = await supabase
    .from('access_requests').select(REQUEST_SELECT).eq('id', id).maybeSingle();
  throwIfError(error, 'Could not load request');
  return sortApprovals(data);
}

export function canViewRequest(user, r) {
  if (ADMIN_ROLES.includes(user.role)) return true;
  if (r.requester_id === user.id) return true;
  if (r.requester?.manager_id === user.id) return true;
  return user.role === 'security_admin' && ['high', 'critical'].includes(r.risk);
}

export async function getRequest(user, id) {
  const r = await fetchRequest(id);
  if (!r) throw new AppError('Request not found', 404);
  if (!canViewRequest(user, r)) throw new AppError('You cannot view this request', 403);
  return r;
}

export async function createRequest(user, body) {
  const { data: software, error: swErr } = await supabase
    .from('software').select('id, name, risk_level, is_active').eq('id', body.software_id).maybeSingle();
  throwIfError(swErr, 'Could not load software');
  if (!software || !software.is_active) throw new AppError('Software not found or no longer available', 404);

  // Access level must belong to the software (and is required if the software defines any)
  const { data: levels } = await supabase
    .from('software_access_levels').select('id').eq('software_id', software.id);
  if (body.access_level_id) {
    if (!levels?.some((l) => l.id === body.access_level_id)) {
      throw new AppError('Access level does not belong to this software', 400);
    }
  } else if (levels?.length) {
    throw new AppError('Please select an access level', 400);
  }

  // Department availability (no rows = open to everyone)
  const departmentId = body.department_id ?? user.department_id ?? null;
  const { data: links } = await supabase
    .from('software_departments').select('department_id').eq('software_id', software.id);
  if (links?.length && !links.some((l) => l.department_id === departmentId)) {
    throw new AppError(`${software.name} is not available for your department`, 403);
  }

  // Duplicate guards
  const { data: open } = await supabase
    .from('access_requests').select('request_no')
    .eq('requester_id', user.id).eq('software_id', software.id)
    .in('status', OPEN_REQUEST_STATUSES).limit(1);
  if (open?.length) {
    throw new AppError(`You already have an open request (${open[0].request_no}) for ${software.name}`, 409);
  }
  const { data: held } = await supabase
    .from('license_assignments').select('id, licenses!inner(software_id)')
    .eq('user_id', user.id).is('revoked_at', null)
    .eq('licenses.software_id', software.id).limit(1);
  if (held?.length) throw new AppError(`You already hold a ${software.name} license`, 409);

  // Emergency access: short-lived only
  if (body.is_emergency) {
    if (!body.end_date) throw new AppError('Emergency access requires an end_date', 400);
    if (body.end_date > addDays(3)) throw new AppError('Emergency access cannot exceed 3 days', 400);
  }

  const { data: created, error } = await supabase
    .from('access_requests')
    .insert({
      requester_id: user.id,
      software_id: software.id,
      access_level_id: body.access_level_id ?? null,
      justification: body.justification,
      priority: body.is_emergency ? 'urgent' : body.priority,
      project: body.project ?? null,
      department_id: departmentId,
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      is_emergency: body.is_emergency,
      risk: software.risk_level, // snapshot: later risk changes don't alter this request
      comments: body.comments ?? null,
    })
    .select('id, request_no').single();
  throwIfError(error, 'Could not create request'); // DB trigger builds the approval chain

  const link = `/requests/${created.id}`;
  if (body.is_emergency) {
    await audit.log({
      actorId: user.id, action: 'emergency_access_requested', entityType: 'access_request',
      entityId: created.id,
      details: { request_no: created.request_no, software: software.name, reason: body.justification, expires: body.end_date },
    });
    await notifications.notifyRoles(
      ['it_admin', 'security_admin', 'super_admin'],
      `🚨 Emergency access request ${created.request_no} for ${software.name} from ${user.full_name}.`,
      link
    );
  } else {
    await audit.log({
      actorId: user.id, action: 'request_created', entityType: 'access_request', entityId: created.id,
      details: { request_no: created.request_no, software: software.name, risk: software.risk_level },
    });
    if (user.manager_id) {
      await notifications.notify(user.manager_id, `🔔 New software request ${created.request_no} (${software.name}) requires your approval.`, link);
    } else {
      await notifications.notifyRoles(['it_admin'], `🔔 Request ${created.request_no} (${software.name}) has no manager and needs review.`, link);
    }
  }
  return fetchRequest(created.id);
}

export async function listRequests(user, query) {
  const { page, limit, from, to } = parsePagination(query);
  let q = supabase.from('access_requests').select(REQUEST_SELECT, { count: 'exact' });

  // Role scoping is enforced here because the service-role client bypasses RLS
  if (query.mine === true || query.mine === 'true' || user.role === 'employee') {
    q = q.eq('requester_id', user.id);
  } else if (user.role === 'manager') {
    q = q.in('requester_id', [user.id, ...(await getTeamIds(user.id))]);
  } else if (user.role === 'security_admin') {
    q = q.in('risk', ['high', 'critical']);
  }

  if (query.status) q = q.eq('status', query.status);
  if (query.priority) q = q.eq('priority', query.priority);
  if (query.software_id) q = q.eq('software_id', query.software_id);
  if (query.department_id) q = q.eq('department_id', query.department_id);
  if (query.risk) q = q.eq('risk', query.risk);
  if (query.requester_id) q = q.eq('requester_id', query.requester_id);
  if (query.from_date) q = q.gte('created_at', `${query.from_date}T00:00:00Z`);
  if (query.to_date) q = q.lte('created_at', `${query.to_date}T23:59:59Z`);
  if (query.search) {
    const s = sanitizeSearch(query.search);
    if (s) q = q.ilike('request_no', `%${s}%`);
  }

  const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, to);
  throwIfError(error, 'Could not load requests');
  return { data: (data || []).map(sortApprovals), meta: pageMeta(count, page, limit) };
}

/** Requests whose CURRENT approval step this user is allowed to decide. */
export async function pendingApprovals(user) {
  let q = supabase.from('access_requests').select(REQUEST_SELECT)
    .in('status', ['pending_manager', 'pending_it', 'pending_security']);

  if (user.role === 'manager') q = q.in('requester_id', await getTeamIds(user.id));
  else if (user.role === 'security_admin') q = q.eq('status', 'pending_security');
  else if (user.role === 'it_admin') q = q.in('status', ['pending_it', 'pending_manager']);

  const { data, error } = await q.limit(200);
  throwIfError(error, 'Could not load pending approvals');

  return (data || [])
    .map(sortApprovals)
    .filter((r) => canActOnStep(user, r, stageForStatus(r.status)))
    .sort((a, b) =>
      Number(b.is_emergency) - Number(a.is_emergency) ||
      new Date(a.created_at) - new Date(b.created_at));
}

export async function cancelRequest(user, id) {
  const r = await fetchRequest(id);
  if (!r) throw new AppError('Request not found', 404);
  if (r.requester_id !== user.id && !ADMIN_ROLES.includes(user.role)) {
    throw new AppError('Only the requester or an admin can cancel this request', 403);
  }
  if (!CANCELLABLE_STATUSES.includes(r.status)) {
    throw new AppError(`A ${r.status} request cannot be cancelled. Revoke the license instead.`, 409);
  }
  const { error } = await supabase.from('access_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', r.status);
  throwIfError(error, 'Could not cancel request');

  await audit.log({
    actorId: user.id, action: 'request_cancelled', entityType: 'access_request', entityId: id,
    details: { request_no: r.request_no, previous_status: r.status },
  });
  if (r.requester_id !== user.id) {
    await notifications.notify(r.requester_id, `Your request ${r.request_no} was cancelled by an administrator.`, `/requests/${id}`);
  }
  return fetchRequest(id);
}

export { OPEN_REQUEST_STATUSES };
