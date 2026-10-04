import { supabase } from '../config/supabase.js';

/**
 * Writes an audit entry. Never throws: a logging failure must not break the main action.
 * Example: audit.log({ actorId, action: 'license_assigned', entityType: 'license', entityId, details })
 */
export const audit = {
  async log({ actorId = null, action, entityType, entityId = null, details = null }) {
    const { error } = await supabase.from('audit_logs').insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      details,
    });
    if (error) console.error('Audit log failed:', error.message);
  },
};
