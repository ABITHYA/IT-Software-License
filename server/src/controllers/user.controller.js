import { supabase } from '../config/supabase.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { revokeLicense } from '../services/licenseService.js'; // Assuming this exists based on your license controller
import { audit } from '../services/auditService.js';

/**
 * PATCH /api/users/:id/deactivate
 * Triggers the offboarding cascade: deactivates user, revokes all assigned licenses, and logs the action.
 */
export const deactivateUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const actorId = req.user.id;

  // 1. Get current user state
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_active')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    throw new AppError('User not found', 404);
  }

  if (!user.is_active) {
    return res.json({ success: true, message: 'User is already inactive.' });
  }

  // 2. Find all currently assigned licenses for this user
  const { data: assignedLicenses, error: licenseError } = await supabase
    .from('licenses')
    .select('id, software_id')
    .eq('assigned_to_id', userId)
    .eq('status', 'assigned');

  if (licenseError) {
    throw new AppError('Could not fetch user licenses', 500);
  }

  // 3. Deactivate the user
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', userId);

  if (updateError) {
    throw new AppError('Failed to deactivate user', 500);
  }

  // 4. Revoke each assigned license (this will trigger your existing waitlist logic!)
  let revokedCount = 0;
  if (assignedLicenses && assignedLicenses.length > 0) {
    for (const license of assignedLicenses) {
      try {
        await revokeLicense({
          licenseId: license.id,
          reason: 'Employee offboarding',
          notes: `Automated revocation during deactivation of ${user.full_name}`,
          actorId,
        });
        revokedCount++;
      } catch (err) {
        console.error(`Failed to revoke license ${license.id}:`, err);
        // We continue the loop even if one fails, to ensure maximum cleanup
      }
    }
  }

  // 5. Log the cascade in the audit trail
  await audit.log({
    actorId,
    action: 'user_deactivated_offboarding',
    entityType: 'user',
    entityId: userId,
    details: {
      userEmail: user.email,
      licensesRevoked: revokedCount,
    },
  });

  res.json({
    success: true,
    message: `User ${user.full_name} deactivated. ${revokedCount} license(s) automatically revoked and returned to the pool.`,
  });
});