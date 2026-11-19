const { createHmac, randomUUID } = require('node:crypto');
const { requireRole } = require('./roles');

const host = 'https://rest.sandbox.lalamove.com';
const fields = 'provider_id,status,quote';
const validId = /^[a-zA-Z0-9_-]{1,100}$/;

function coordinates(lat, lng) {
  if (![lat, lng].every(value => typeof value === 'string' && /^-?\d{1,3}(\.\d{1,12})?$/.test(value))) return null;
  return Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180 ? { lat, lng } : null;
}

function sandboxConfig(env) {
  const pickup = coordinates(env.LALAMOVE_PICKUP_LAT, env.LALAMOVE_PICKUP_LNG);
  if (env.LALAMOVE_SANDBOX_ENABLED !== 'true' || !/^pk_test/.test(env.LALAMOVE_API_KEY || '') ||
      !/^sk_test/.test(env.LALAMOVE_API_SECRET || '') || !pickup || !env.LALAMOVE_PICKUP_ADDRESS?.trim() ||
      !/^\+639\d{9}$/.test(env.LALAMOVE_TEST_PHONE || '') || !env.SUPABASE_SECRET_KEY) return null;
  return { key: env.LALAMOVE_API_KEY, secret: env.LALAMOVE_API_SECRET, pickup, address: env.LALAMOVE_PICKUP_ADDRESS, phone: env.LALAMOVE_TEST_PHONE };
}

function createProvider(config, fetcher = fetch) {
  return async function call(method, path, payload) {
    const body = payload ? JSON.stringify({ data: payload }) : '';
    const time = String(Date.now());
    const signature = createHmac('sha256', config.secret).update([time, method, path, '', body].join('\r\n')).digest('hex');
    const response = await fetcher(host + path, {
      method, body: body || undefined, redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { Authorization: 'hmac ' + [config.key, time, signature].join(':'), Market: 'PH', 'Content-Type': 'application/json', 'Request-ID': randomUUID() }
    });
    if (!response.ok) throw Object.assign(new Error('Lalamove rejected the request.'), { providerStatus: response.status });
    return response.status === 204 ? null : (await response.json()).data;
  };
}

function mountLalamove(router, integration) {
  router.use('/delivery', requireRole('owner', 'platform_admin', 'staff'));
  router.get('/delivery/config', (_req, res) => res.json({ enabled: Boolean(integration) }));
  router.post('/delivery/:id', async (req, res) => {
    if (!integration) return res.status(503).json({ error: 'Lalamove sandbox is unavailable.' });
    const { db, call, config } = integration;
    const id = req.params.id;
    const { action } = req.body || {};
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid order reference.' });
    const table = () => db.from('lalamove_deliveries');
    const save = async values => {
      const { error } = await table().update(values).eq('order_id', id);
      if (error) throw error;
    };
    const send = row => res.json({ status: row?.status || 'NOT_BOOKED', providerId: row?.provider_id || null,
      quote: row?.status === 'QUOTED' ? { id: row.quote.id, total: row.quote.total, expiresAt: row.quote.expiresAt } : null });
    try {
      const order = await req.adminClient.from('orders').select('id,status').eq('id', id).maybeSingle();
      if (order.error) throw order.error;
      if (!order.data) return res.status(404).json({ error: 'Order not found.' });
      const existing = await table().select(fields).eq('order_id', id).maybeSingle();
      if (existing.error) throw existing.error;
      const row = existing.data;
      if (action === 'view') return send(row);
      if (action === 'quote') {
        if (order.data.status !== 'ready' || (row && row.status !== 'QUOTED')) return res.status(409).json({ error: 'Only ready orders without a booking can be quoted.' });
        const drop = coordinates(req.body.lat, req.body.lng);
        const address = typeof req.body.address === 'string' ? req.body.address.trim() : '';
        if (!drop || !address || address.length > 250) return res.status(400).json({ error: 'Enter a test drop-off address and valid coordinates.' });
        const data = await call('POST', '/v3/quotations', {
          serviceType: 'MOTORCYCLE', language: 'en_PH',
          stops: [{ coordinates: config.pickup, address: config.address }, { coordinates: drop, address }]
        });
        const total = data?.priceBreakdown?.total;
        if (!validId.test(data?.quotationId || '') || !data.stops?.slice(0, 2).every(stop => validId.test(stop.stopId || '')) ||
            data.stops?.length !== 2 || data.priceBreakdown?.currency !== 'PHP' || !/^\d+(\.\d{1,2})?$/.test(total) ||
            !(Date.parse(data.expiresAt) > Date.now())) throw new Error('Invalid quote');
        const quote = { id: data.quotationId, stops: data.stops.map(stop => stop.stopId), total, expiresAt: data.expiresAt };
        const result = row ? await table().update({ quote }).eq('order_id', id).eq('status', 'QUOTED').select(fields).maybeSingle()
          : await table().insert({ order_id: id, status: 'QUOTED', quote }).select(fields).single();
        if (result.error || !result.data) return res.status(409).json({ error: 'Delivery changed. Refresh its status.' });
        return send(result.data);
      }
      if (action === 'book') {
        if (order.data.status !== 'ready' || row?.status !== 'QUOTED' || req.body.quoteId !== row.quote.id ||
            !(Date.parse(row.quote.expiresAt) > Date.now())) return res.status(409).json({ error: 'Get and review a current quote for this ready order.' });
        const claim = await table().update({ status: 'BOOKING_UNCONFIRMED', quote: { ...row.quote, claimedAt: Date.now() } }).eq('order_id', id).eq('status', 'QUOTED')
          .eq('quote->>id', row.quote.id).select('order_id').maybeSingle();
        if (claim.error) throw claim.error;
        if (!claim.data) return res.status(409).json({ error: 'Another request changed this delivery. Refresh its status.' });
        try {
          const data = await call('POST', '/v3/orders', {
            quotationId: row.quote.id,
            sender: { stopId: row.quote.stops[0], name: 'Kathy Sandbox Pickup', phone: config.phone },
            recipients: [{ stopId: row.quote.stops[1], name: 'Sandbox Recipient', phone: config.phone }],
            metadata: { restaurantOrderId: id }
          });
          if (!validId.test(data?.orderId || '') || typeof data.status !== 'string') throw new Error('Unconfirmed booking');
          await save({ provider_id: data.orderId, status: data.status });
          return send({ provider_id: data.orderId, status: data.status });
        } catch (error) {
          if ([400, 401, 403, 422, 429].includes(error.providerStatus)) {
            await save({ status: 'QUOTED' });
            return res.status(409).json({ error: 'Lalamove rejected the booking. Check the sandbox setup and get a fresh quote.' });
          }
          return res.status(502).json({ error: 'Booking result is unknown. Check the Partner Portal and recover the booking by its Lalamove order ID.' });
        }
      }
      if (['refresh', 'cancel', 'recover'].includes(action)) {
        if (action === 'recover' && (row?.status !== 'BOOKING_UNCONFIRMED' || Date.now() - row.quote.claimedAt < 30000)) {
          return res.status(409).json({ error: 'Wait at least 30 seconds after booking before recovering an unconfirmed delivery.' });
        }
        const providerId = action === 'recover' ? req.body.providerId : row?.provider_id;
        if (typeof providerId !== 'string' || !validId.test(providerId)) return res.status(409).json({ error: 'A valid Lalamove order ID is required.' });
        const path = '/v3/orders/' + providerId;
        if (action === 'cancel') await call('DELETE', path);
        const data = await call('GET', path);
        if (data?.orderId !== providerId || typeof data.status !== 'string' ||
            (action === 'recover' && data.quotationId !== row.quote.id)) return res.status(409).json({ error: 'The provider order could not be verified against this booking.' });
        await save({ provider_id: providerId, status: data.status });
        return send({ provider_id: providerId, status: data.status });
      }
      return res.status(400).json({ error: 'Unknown delivery action.' });
    } catch (error) {
      return res.status(error.providerStatus === 409 ? 409 : 503).json({
        error: error.providerStatus === 409 ? 'Lalamove declined this action at the current delivery stage.' : 'Delivery service unavailable. Refresh the delivery status before retrying.'
      });
    }
  });
}

module.exports = { sandboxConfig, createProvider, mountLalamove };
