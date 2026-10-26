const express = require('express');
const { readMenu } = require('./menu-store');

function preferences(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { category = 'all', section = 'all', budget = null, useHistory = false } = body;
  if (!['all', 'bites', 'coffee', 'sweet'].includes(category) || typeof section !== 'string' ||
      !section.trim() || section.length > 120 || typeof useHistory !== 'boolean' ||
      (budget !== null && (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0 || budget > 100000))) return null;
  return { category, section, budget, useHistory };
}

function recommend(menu, prefs, orders = []) {
  const frequencies = new Map(), sections = new Map();
  const current = new Map(menu.map(item => [item.id, item]));
  for (const order of orders) {
    if (order.status !== 'completed' || !Array.isArray(order.items)) continue;
    // Count each product once per order; a large quantity must not dominate taste.
    for (const id of new Set(order.items.map(line => line.product_id))) {
      const item = current.get(id);
      if (!item || item.available === false) continue;
      frequencies.set(id, (frequencies.get(id) || 0) + 1);
      sections.set(item.section, (sections.get(item.section) || 0) + 1);
    }
  }
  const ranked = menu.flatMap(item => {
    if (item.available === false || (prefs.category !== 'all' && item.category !== prefs.category) ||
        (prefs.section !== 'all' && item.section !== prefs.section)) return [];
    const options = Array.isArray(item.variants) && item.variants.length ? item.variants : [{ label: 'Regular', price: item.price }];
    const variants = options.filter(option => typeof option.label === 'string' && option.label &&
      option.price !== null && option.price !== '' && Number.isFinite(Number(option.price)) && Number(option.price) >= 0 &&
      (prefs.budget === null || Math.round(Number(option.price) * 100) <= Math.round(prefs.budget * 100)));
    if (!variants.length) return [];
    const repeat = frequencies.get(item.id) || 0, related = sections.get(item.section) || 0;
    const reasons = [];
    if (repeat) reasons.push('You ordered this before in a completed order.');
    else if (related) reasons.push('From a section you previously ordered from.');
    if (prefs.section !== 'all') reasons.push('Matches your selected section.');
    else if (prefs.category !== 'all') reasons.push('Matches your selected menu group.');
    if (prefs.budget !== null) reasons.push('Shown portions fit your price limit.');
    if (!reasons.length) reasons.push('An available option to explore from the menu.');
    return [{ item: { ...item, variants }, reasons, score: Math.min(repeat, 5) * 4 + Math.min(related, 5) }];
  }).sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name) || String(a.item.id).localeCompare(String(b.item.id)));
  const chosen = [], counts = new Map();
  while (ranked.length && chosen.length < 4) {
    // Prefer variety within similar scores; ties remain deterministic.
    ranked.sort((a, b) => (b.score - (counts.get(b.item.section) || 0) * 3) - (a.score - (counts.get(a.item.section) || 0) * 3));
    const entry = ranked.shift();
    chosen.push({ item: entry.item, reasons: entry.reasons });
    counts.set(entry.item.section, (counts.get(entry.item.section) || 0) + 1);
  }
  return chosen;
}

function recommendationsRouter(url, key, createClient) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(express.json({ limit: '2kb' }));
  router.post('/', async (req, res) => {
    const prefs = preferences(req.body);
    if (!prefs) return res.status(400).json({ error: 'Choose a valid menu group, section and positive price limit.' });
    try {
      const publicClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      let history = 'off', orders = [];
      if (prefs.useHistory) {
        const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
        if (!token) return res.status(401).json({ error: 'Sign in to use your completed orders.' });
        const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
        const { data, error } = await client.auth.getUser(token);
        if (error || !data.user || data.user.is_anonymous) return res.status(401).json({ error: 'Sign in again to use your completed orders.' });
        try {
          const result = await client.from('orders').select('items,status').eq('user_id', data.user.id)
            .eq('status', 'completed').order('created_at', { ascending: false }).order('id').range(0, 49);
          if (result.error || !Array.isArray(result.data)) throw new Error('History unavailable');
          orders = result.data; history = orders.length ? 'used' : 'empty';
        } catch { history = 'unavailable'; }
      }
      const menu = await readMenu(publicClient, { publicOnly: true });
      res.json({ recommendations: recommend(menu, prefs, orders), history });
    } catch { res.status(503).json({ error: 'Suggestions are unavailable. Try again or browse the full menu below.' }); }
  });
  router.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid recommendation request.' }));
  return router;
}
module.exports = { preferences, recommend, recommendationsRouter };
