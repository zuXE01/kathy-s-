const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const config = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };

test('configuration fails closed without a publishable key', () => {
  assert.throws(() => createApp({}), /Set SUPABASE/);
  assert.throws(() => createApp({ ...config, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_test' }), /Set SUPABASE/);
});

test('server protects account details and removes unsafe legacy endpoints', async t => {
  const app = createApp(config, () => ({ auth: { getUser: async token => token === 'valid'
    ? { data: { user: { id: 'one', email: 'member@example.com', user_metadata: { name: 'Member' } } } }
    : { data: { user: null }, error: new Error('invalid') } } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin + '/health')).status, 200);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await fetch(origin + '/vendor/supabase.js')).status, 200);
  for (const path of ['/api/reset-password', '/api/login', '/api/register']) {
    assert.equal((await fetch(origin + path, { method: 'POST' })).status, 404);
  }
  for (const path of ['/.env', '/kathyshub.sqlite', '/server.js']) {
    assert.equal((await fetch(origin + path)).status, 404);
  }
  assert.equal((await fetch(origin + '/api/me')).status, 401);
  assert.equal((await fetch(origin + '/api/me', { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  const me = await fetch(origin + '/api/me', { headers: { Authorization: 'Bearer valid' } });
  assert.equal(me.status, 200);
  assert.equal(me.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await me.json(), { id: 'one', email: 'member@example.com', name: 'Member' });
  const publicConfig = await (await fetch(origin + '/api/config')).json();
  assert.deepEqual(Object.keys(publicConfig).sort(), ['publishableKey', 'url']);
});
