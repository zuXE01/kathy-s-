const expiryMs = 3 * 60 * 60 * 1000;

function startOrderExpiry(db, payments, { intervalMs = 60000, onError = console.error } = {}) {
  let stopped = false;
  let timer;
  let cursor;
  async function run() {
    try {
      let query = db.from('orders').select('id,user_id,total_cents,payment_method,version')
        .eq('status', 'pending').lte('created_at', new Date(Date.now() - expiryMs).toISOString())
        .order('id').limit(25);
      if (cursor) query = query.gt('id', cursor);
      const { data, error } = await query;
      if (error) throw error;
      for (const order of data) {
        if (stopped) break;
        cursor = order.id;
        try {
          if (order.payment_method === 'maya-sandbox') {
            if (!payments) continue;
            const payment = await payments.find(order.id);
            if (payment?.status === 'sandbox-paid') continue;
            await payments.beforeClose(order, 'cancelled');
          }
          const result = await db.rpc('hub_expire_pending_order', { p_order: order.id, p_version: order.version });
          if (result.error) throw result.error;
        } catch (error) {
          onError('order_expiry_item: ' + (error.code || error.status || 'unavailable'));
        }
      }
      if (data.length < 25) cursor = undefined;
    } catch (error) {
      onError('order_expiry_worker: ' + (error.code || 'unavailable'));
    } finally {
      if (!stopped) {
        timer = setTimeout(run, intervalMs);
        timer.unref();
      }
    }
  }
  timer = setTimeout(run, 0);
  timer.unref();
  return () => { stopped = true; clearTimeout(timer); };
}

module.exports = { startOrderExpiry };
