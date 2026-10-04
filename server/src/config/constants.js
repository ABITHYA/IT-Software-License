export const ROLES = ['employee', 'manager', 'it_admin', 'security_admin', 'super_admin'];
export const ADMIN_ROLES = ['it_admin', 'super_admin'];
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const APPROVAL_STAGES = ['manager', 'it', 'security']; // canonical order

export const PENDING_STATUS_BY_STAGE = {
  manager: 'pending_manager',
  it: 'pending_it',
  security: 'pending_security',
};
export const REJECT_STATUS_BY_STAGE = {
  manager: 'manager_rejected',
  it: 'it_rejected',
  security: 'security_rejected',
};
export const STAGE_LABELS = { manager: 'Manager', it: 'IT', security: 'Security' };

// A user may not file a second request while one of these is open
export const OPEN_REQUEST_STATUSES = [
  'pending_manager', 'manager_approved', 'pending_it', 'it_approved', 'approved',
  'pending_security', 'waiting_for_license', 'active',
];
export const CANCELLABLE_STATUSES = [
  'draft', 'pending_manager', 'manager_approved', 'pending_it', 'it_approved', 'approved',
  'pending_security', 'waiting_for_license',
];

// Statuses that mean "all approvals done, still needs a license"
export const AWAITING_LICENSE_STATUSES = ['approved', 'it_approved', 'waiting_for_license'];

export const REVOKE_REASONS = {
  resigned: 'Employee resigned',
  project_completed: 'Project completed',
  temporary_ended: 'Temporary access ended',
  unused: 'License unused',
  policy_violation: 'Policy violation',
  no_longer_required: 'Software no longer required',
  other: 'Other',
};

export const STATUS_LABELS = {
  draft: 'Draft',
  pending_manager: 'Pending Manager Approval',
  manager_approved: 'Manager Approved',
  manager_rejected: 'Rejected by Manager',
  pending_it: 'Pending IT Review',
  it_approved: 'IT Approved',
  it_rejected: 'Rejected by IT',
  pending_security: 'Pending Security Review',
  security_rejected: 'Rejected by Security',
  approved: 'Approved (assigning license)',
  waiting_for_license: 'Waiting for License',
  license_assigned: 'License Assigned',
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
  cancelled: 'Cancelled',
};