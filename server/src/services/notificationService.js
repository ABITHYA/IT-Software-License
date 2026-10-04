import { supabase } from '../config/supabase.js';

export const notifications = {
  async notify(userId, message, link = null) {
    if (!userId) return;
    const { error } = await supabase
      .from('notifications')
      .insert({ user_id: userId, message, link });
    if (error) console.error('Notification failed:', error.message);
  },

  async notifyMany(userIds, message, link = null) {
    const rows = [...new Set(userIds)].filter(Boolean).map((id) => ({ user_id: id, message, link }));
    if (!rows.length) return;
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) console.error('Notification failed:', error.message);
  },

  /** Notify every active user holding one of the given roles (e.g. all IT admins). */
  async notifyRoles(roles, message, link = null) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .in('role', roles)
      .eq('is_active', true);
    await this.notifyMany((data || []).map((u) => u.id), message, link);
  },
};
