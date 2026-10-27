// Shared read-only personalization. Never use a privileged client or accept an owner ID.
async function readRecommendationHistory({ useHistory, authorization, url, key, createClient }) {
  if (!useHistory) return { orders: [], history: 'off' };
  const token = /^Bearer (\S+)$/.exec(authorization || '')?.[1];
  if (!token) throw Object.assign(new Error('Sign in to use your completed orders.'), { status: 401 });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw Object.assign(new Error('Sign in again to use your completed orders.'), { status: 401 });
  try {
    const result = await client.from('orders').select('items,status').eq('user_id', data.user.id)
      .eq('status', 'completed').order('created_at', { ascending: false }).order('id').range(0, 49);
    if (result.error || !Array.isArray(result.data)) throw new Error('History unavailable');
    return { orders: result.data, history: result.data.length ? 'used' : 'empty' };
  } catch { return { orders: [], history: 'unavailable' }; }
}
module.exports = { readRecommendationHistory };
