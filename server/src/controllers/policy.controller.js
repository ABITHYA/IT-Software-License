import { supabase } from '../config/supabase.js';
import { APPROVAL_STAGES } from '../config/constants.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { throwIfError } from '../utils/dbError.js';
import { audit } from '../services/auditService.js';

const ORDER = ['low', 'medium', 'high', 'critical'];

// GET /api/policies
export const listPolicies = asyncHandler(async (_req, res) => {
  const { data, error } = await supabase.from('approval_policies').select('*');
  throwIfError(error);
  res.json({ success: true, data: data.sort((a, b) => ORDER.indexOf(a.risk) - ORDER.indexOf(b.risk)) });
});

// PUT /api/policies/:risk   (affects NEW requests only; existing chains are unchanged)
export const updatePolicy = asyncHandler(async (req, res) => {
  const stages = [...req.body.stages].sort((a, b) => APPROVAL_STAGES.indexOf(a) - APPROVAL_STAGES.indexOf(b));
  const { data, error } = await supabase.from('approval_policies')
    .update({ stages }).eq('risk', req.params.risk).select().single();
  throwIfError(error, 'Could not update policy');
  await audit.log({
    actorId: req.user.id, action: 'approval_policy_changed', entityType: 'approval_policy',
    entityId: req.params.risk, details: { stages },
  });
  res.json({ success: true, data });
});
