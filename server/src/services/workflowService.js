/**
 * Stub for workflowService.js
 * This unblocks the server startup. We will implement the actual
 * advance() and notifyStageApprovers() logic when we build the
 * Approval Engine feature.
 */

export const advance = (approvals, currentStep, decision) => {
  // Temporary stub: just return a mock outcome so the server doesn't crash
  // when approvalService tries to call it.
  return {
    type: decision === 'rejected' ? 'rejected' : 'next',
    status: decision === 'rejected' ? 'rejected' : 'approved',
    next: { stage: 'it' }
  };
};

export const notifyStageApprovers = async (stage, request, message) => {
  // Temporary stub: log to console instead of sending real notifications
  console.log(`[WORKFLOW STUB] Notifying ${stage} approvers:`, message);
};