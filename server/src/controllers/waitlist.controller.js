import { supabase } from '../config/supabase.js';
import { ADMIN_ROLES } from '../config/constants.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { throwIfError } from '../utils/dbError.js';
import { audit } from '../services/auditService.js';
import { processWaitlist } from '../services/waitlistService.js';

// GET /api/waitlist  (admins: everyone; others: only their own entries)
export const listWaitlist = asyncHandler(async (req, res) => {
  let q = supabase
    .from('access_requests')
    .select('id, request_no, requester_id, software_id, priority, is_emergency, created_at, requester:profiles!requester_id(id, full_name, email), software:software_id(id, name)')
    .eq('status', 'waiting_for_license')
    .order('is_emergency', { ascending: false })
    .order('created_at', { ascending: true });
  if (req.query.software_id) q = q.eq('software_id', req.query.software_id);

  const { data, error } = await q;
  throwIfError(error, 'Could not load waitlist');

  // Position is per software, computed before any visibility filtering
  const counters = {};
  const rows = data.map((r) => {
    counters[r.software_id] = (counters[r.software_id] || 0) + 1;
    return { ...r, position: counters[r.software_id] };
  });
  const visible = ADMIN_ROLES.includes(req.user.role) ? rows : rows.filter((r) => r.requester_id === req.user.id);
  res.json({ success: true, data: visible, count: visible.length });
});

// POST /api/waitlist/process/:softwareId   (manual trigger)
export const processNow = asyncHandler(async (req, res) => {
  const fulfilled = await processWaitlist(req.params.softwareId, req.user.id);
  await audit.log({
    actorId: req.user.id, action: 'waitlist_processed', entityType: 'software',
    entityId: req.params.softwareId, details: { fulfilled },
  });
  res.json({ success: true, message: `${fulfilled} waiting request(s) fulfilled`, data: { fulfilled } });
});
