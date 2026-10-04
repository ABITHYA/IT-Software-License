import { PENDING_STATUS_BY_STAGE } from '../config/constants.js';

export const stageForStatus = (status) =>
  Object.keys(PENDING_STATUS_BY_STAGE).find((s) => PENDING_STATUS_BY_STAGE[s] === status) ?? null;

/**
 * Who may act on the current approval step?
 *  - nobody can approve their own request (not even super_admin)
 *  - separation of duties: one person can't decide two steps of the same request (super_admin exempt)
 *  - manager step: the requester's direct manager. IT admin may step in for emergency
 *    requests or when the requester has no manager.
 *  - it step: it_admin    - security step: security_admin    - super_admin: any step
 */
export function canActOnStep(user, request, stage) {
  if (user.id === request.requester_id) return false;
  if (user.role === 'super_admin') return true;

  const alreadyDecided = (request.approvals || []).some(
    (a) => a.decision !== 'pending' && a.approver?.id === user.id
  );
  if (alreadyDecided) return false;

  switch (stage) {
    case 'manager':
      if (request.requester?.manager_id === user.id) return true;
      return (
        user.role === 'it_admin' && (request.is_emergency || !request.requester?.manager_id)
      );
    case 'it':
      return user.role === 'it_admin';
    case 'security':
      return user.role === 'security_admin';
    default:
      return false;
  }
}
