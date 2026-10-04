import { supabase } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { throwIfError } from '../utils/dbError.js';
import { canActOnStep } from '../utils/approvalRules.js';
import {
  PENDING_STATUS_BY_STAGE, STAGE_LABELS, AWAITING_LICENSE_STATUSES,
} from '../config/constants.js';
import { audit } from './auditService.js';
import { notifications } from './notificationService.js';
import { fetchRequest } from './requestService.js';
import { advance, notifyStageApprovers } from './workflowService.js';
import { setStatus, runAssignment } from './assignmentService.js';

export async function decide({ requestId, user, decision, comments = null }) {
  const request = await fetchRequest(requestId);
  if (!request) throw new AppError('Request not found', 404);

  const step = request.approvals.find((a) => a.decision === 'pending');
  if (!step || request.status !== PENDING_STATUS_BY_STAGE[step.stage]) {
    throw new AppError('This request is not awaiting approval', 409);
  }
  if (!canActOnStep(user, request, step.stage)) {
    throw new AppError('You are not allowed to act on this approval step', 403);
  }

  // Conditional update guards against double-submits / two approvers racing
  const { data: updated, error } = await supabase
    .from('request_approvals')
    .update({ decision, approver_id: user.id, comments, decided_at: new Date().toISOString() })
    .eq('id', step.id).eq('decision', 'pending').select('id').maybeSingle();
  throwIfError(error, 'Could not record decision');
  if (!updated) throw new AppError('This step was already decided', 409);

  const label = `${request.request_no} (${request.software.name})`;
  const link = `/requests/${request.id}`;
  const audited = { actorId: user.id, entityType: 'access_request', entityId: request.id };
  const outcome = advance(request.approvals, step, decision);

  if (outcome.type === 'rejected') {
    await setStatus(request.id, outcome.status);
    await notifications.notify(
      request.requester_id,
      `❌ Your request ${label} was rejected at ${STAGE_LABELS[step.stage]} review${comments ? `: ${comments}` : '.'}`,
      link
    );
    await audit.log({ ...audited, action: 'request_rejected', details: { stage: step.stage, reason: comments } });
    return fetchRequest(request.id);
  }

  const bypass =
    step.stage === 'manager' && request.requester?.manager_id !== user.id && user.role !== 'super_admin';
  await audit.log({
    ...audited, action: 'request_approved',
    details: { stage: step.stage, comments, emergency_or_no_manager_bypass: bypass },
  });

  if (outcome.type === 'next') {
    await setStatus(request.id, outcome.status);
    await notifyStageApprovers(
      outcome.next.stage, request,
      `🔔 Request ${label} needs your ${STAGE_LABELS[outcome.next.stage]} review.`, link
    );
    await notifications.notify(
      request.requester_id,
      `✅ ${STAGE_LABELS[step.stage]} approved your request ${label}. Next: ${STAGE_LABELS[outcome.next.stage]} review.`,
      link
    );
  } else {
    await runAssignment(request, user.id); // status -> approved, then license assigned or waitlisted
  }
  return fetchRequest(request.id);
}

/** IT retry for requests stuck after approval, or to fulfil a waitlisted one once stock exists. */
export async function retryAssignment(requestId, user) {
  const request = await fetchRequest(requestId);
  if (!request) throw new AppError('Request not found', 404);
  if (!AWAITING_LICENSE_STATUSES.includes(request.status)) {
    throw new AppError(`Request is ${request.status}; nothing to assign`, 409);
  }
  const result = await runAssignment(request, user.id, { markApproved: false });
  return { result, request: await fetchRequest(requestId) };
}