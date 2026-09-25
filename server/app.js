const express = require('express');
const helmet = require('helmet');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { adminRouter } = require('./admin');
const { readMenu } = require('./menu-store');
const { ordersRouter } = require('./orders');

function createApp(env = process.env, createAuthClient = createClient) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key?.startsWith('sb_publishable_')) {
    throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env or Render environment settings.');
  }
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], connectSrc: ["'self'", url],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"], frameAncestors: ["'none'"],
      upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null
    } },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: env.NODE_ENV === 'production'
  }));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/config', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ url, publishableKey: key });
  });
  app.get('/api/me', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token) return res.status(401).json({ error: 'Sign in first.' });
    try {
      const auth = createAuthClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await auth.auth.getUser(token);
      if (error || !data.user) return res.status(401).json({ error: 'Your session has expired. Sign in again.' });
      res.json({ id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name || '' });
    } catch {
      res.status(503).json({ error: 'Account service temporarily unavailable.' });
    }
  });
  app.use('/api/admin', adminRouter(url, key, createAuthClient));
  app.use('/api/orders', ordersRouter(url,key,createAuthClient));
  app.get('/api/menu', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const client = createAuthClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      res.json({ items: await readMenu(client,{publicOnly:true}) });
    } catch { res.status(503).json({ error: 'Menu is temporarily unavailable.' }); }
  });
  // Old unauthenticated mutation endpoints are deliberately removed.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.get('/vendor/supabase.js', (_req, res) => {
    res.sendFile(path.join(__dirname, '../node_modules/@supabase/supabase-js/dist/umd/supabase.js'));
  });
  app.use(express.static(path.join(__dirname, '../public'), { dotfiles: 'deny' }));
  return app;
}

module.exports = { createApp };
