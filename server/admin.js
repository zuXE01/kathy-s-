const express = require('express');
const { validateItem } = require('./menu-validation');
const { readMenu } = require('./menu-store');
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function adminRouter(url, key, createClient) {
  const router = express.Router();
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token) return res.status(401).json({ error: 'Please sign in first.' });
    try {
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return res.status(401).json({ error: 'Please sign in again.' });
      // Admin assignment is trusted app metadata, never a submitted email or user metadata.
      if (data.user.app_metadata?.hub_role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
      req.adminClient = client;
      req.adminUser = data.user;
      next();
    } catch { res.status(503).json({ error: 'Authentication service unavailable.' }); }
  });
  router.use(express.json({ limit: '8kb' }));
  router.get('/overview', async (req, res) => {
    const [members, menu, available] = await Promise.all([
      req.adminClient.from('profiles').select('id', { count: 'exact', head: true }),
      req.adminClient.from('menu_items').select('id', { count: 'exact', head: true }),
      req.adminClient.from('menu_items').select('id', { count: 'exact', head: true }).eq('available', true)
    ]);
    if (members.error || menu.error || available.error) return res.status(503).json({ error: 'Unable to load overview. Sign out and back in if your admin role was just assigned.' });
    res.json({ email: req.adminUser.email, members: members.count, menu: menu.count, available: available.count });
  });
  router.get('/members', async (req, res) => {
    const page = Number(req.query.page || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return res.status(400).json({ error: 'Invalid page.' });
    const { data, error, count } = await req.adminClient.from('profiles')
      .select('id,name,created_at', { count: 'exact' }).order('created_at', { ascending: false }).order('id')
      .range((page - 1) * 20, page * 20 - 1);
    if (error) return res.status(503).json({ error: 'Unable to load members.' });
    res.json({ items: data, total: count, page });
  });
  router.get('/menu', async (req, res) => {
    try { res.json({ items: await readMenu(req.adminClient) }); }
    catch { res.status(503).json({ error: 'Unable to load menu.' }); }
  });
  router.post('/menu', async (req, res) => {
    const item = validateItem(req.body);
    if (!item) return res.status(400).json({ error: 'Check the name, section, category and prices. Use unique option labels and prices with at most 2 decimals.' });
    const { data, error } = await req.adminClient.from('menu_items').insert(item).select().single();
    if (error) return res.status(error.code === '23505' ? 409 : 503).json({ error: error.code === '23505' ? 'This item already exists in that section. Edit the existing card instead.' : 'Could not save this item.' });
    res.status(201).json({ item: data });
  });
  router.put('/menu/:id', async (req, res) => {
    const item = validateItem(req.body);
    if (!validId.test(req.params.id) || !item) return res.status(400).json({ error: 'Invalid menu details.' });
    const { data, error } = await req.adminClient.from('menu_items').update(item).eq('id', req.params.id).select().maybeSingle();
    if (error) return res.status(error.code === '23505' ? 409 : 503).json({ error: error.code === '23505' ? 'This item already exists in that section.' : 'Could not update this item.' });
    if (!data) return res.status(404).json({ error: 'Item no longer exists. Refresh the menu.' });
    res.json({ item: data });
  });
  router.delete('/menu/:id', async (req, res) => {
    if (!validId.test(req.params.id)) return res.status(400).json({ error: 'Invalid item.' });
    const { data, error } = await req.adminClient.from('menu_items').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error) return res.status(503).json({ error: 'Could not remove this item.' });
    if (!data) return res.status(404).json({ error: 'Item no longer exists.' });
    res.json({ ok: true });
  });
  router.use((error, _req, res, _next) => {
    res.status(error.status === 400 || error.status === 413 ? error.status : 503)
      .json({ error: 'Request could not be processed. Check your input and try again.' });
  });
  return router;
}
module.exports = { adminRouter, validateItem };
