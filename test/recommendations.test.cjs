const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const { preferences, recommend } = require('../server/recommendations');
const menu = [
  { id: 'a', name: 'Americano', category: 'coffee', section: 'Coffee', available: true, variants: [{ label: 'Hot', price: 100 }, { label: 'Cold', price: 150 }] },
  { id: 'b', name: 'Latte', category: 'coffee', section: 'Coffee', available: true, price: 120 },
  { id: 'c', name: 'Cake', category: 'sweet', section: 'Desserts', available: true, price: 130 },
  { id: 'd', name: 'Hidden', category: 'coffee', section: 'Coffee', available: false, price: 1 }
];
test('recommendations enforce price per option, section, group and availability without mutating menu', () => {
  const before = JSON.stringify(menu);
  const result = recommend(menu, preferences({ category: 'coffee', section: 'Coffee', budget: 110 }));
  assert.equal(result.length, 1); assert.equal(result[0].item.id, 'a');
  assert.deepEqual(result[0].item.variants, [{ label: 'Hot', price: 100 }]);
  assert.equal(JSON.stringify(menu), before);
  assert.deepEqual(recommend(menu, preferences({ budget: 0.5 })), []);
  assert.deepEqual(recommend(menu, preferences({ section: 'Removed section' })), []);
});
test('only completed orders boost real products; repeated quantities and unknown items do not dominate', () => {
  const prefs = preferences({});
  const result = recommend(menu, prefs, [
    { status: 'cancelled', items: [{ product_id: 'a' }] },
    { status: 'completed', items: [{ product_id: 'c', quantity: 99 }, { product_id: 'missing' }] }
  ]);
  assert.equal(result[0].item.id, 'c'); assert.match(result[0].reasons.join(' '), /completed order/);
  assert.equal(result.find(entry => entry.item.id === 'a').reasons.some(reason => /ordered/.test(reason)), false);
  assert.deepEqual(recommend(menu, prefs), recommend(menu, prefs));
});
test('invalid and unbounded preferences are rejected', () => {
  for (const input of [null, [], { budget: -1 }, { budget: '150' }, { budget: Infinity }, { budget: 100001 },
    { category: 'invalid' }, { section: '' }, { useHistory: 'true' }]) assert.equal(preferences(input), null);
});
async function setup(t) {
  const reads = []; let failHistory = false, failMenu = false;
  const client = (_url, _key, options = {}) => {
    const token = options.global?.headers?.Authorization?.slice(7);
    return {
      auth: { getUser: async () => ({ data: { user: token === 'invalid' ? null : { id: token, is_anonymous: token === 'anonymous' } } }) },
      from(table) {
        const filters = []; let columns;
        const query = { select(value) { columns = value; return this; }, eq(key, value) { filters.push([key, value]); return this; },
          order() { return this; }, range() { return this; },
          then(resolve, reject) {
            reads.push({ table, filters, columns, token });
            if ((table === 'orders' && failHistory) || (table === 'menu_items' && failMenu)) return Promise.reject(new Error('Unavailable')).then(resolve, reject);
            const data = table === 'menu_items' ? menu.filter(item => item.available) : token === 'alice'
              ? [{ status: 'completed', items: [{ product_id: 'c' }] }] : [];
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          } };
        return query;
      }
    };
  };
  const app = createApp({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }, client);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { reads, failHistory: () => { failHistory = true; }, failMenu: () => { failMenu = true; },
    send: (body, token) => fetch('http://127.0.0.1:' + server.address().port + '/api/recommendations', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body)
    }) };
}
test('public suggestions never read history; authenticated history is scoped to verified owner and minimal columns', async t => {
  const f = await setup(t);
  const guest = await f.send({}); assert.equal(guest.status, 200); assert.equal(guest.headers.get('cache-control'), 'no-store');
  assert.equal(f.reads.some(read => read.table === 'orders'), false);
  assert.equal((await f.send({ useHistory: true })).status, 401);
  assert.equal((await f.send({ useHistory: true }, 'invalid')).status, 401);
  assert.equal((await f.send({ useHistory: true }, 'anonymous')).status, 401);
  const alice = await (await f.send({ useHistory: true, user_id: 'bob' }, 'alice')).json();
  assert.equal(alice.history, 'used'); assert.equal(alice.recommendations[0].item.id, 'c');
  const history = f.reads.find(read => read.table === 'orders');
  assert.deepEqual(history.filters, [['user_id', 'alice'], ['status', 'completed']]); assert.equal(history.columns, 'items,status');
  const bob = await (await f.send({ useHistory: true }, 'bob')).json(); assert.equal(bob.history, 'empty');
  assert.equal(JSON.stringify(alice).includes('user_id'), false);
});
test('history failures fall back explicitly, menu failure is recoverable, malformed input fails', async t => {
  const f = await setup(t); f.failHistory();
  const fallback = await (await f.send({ useHistory: true }, 'alice')).json();
  assert.equal(fallback.history, 'unavailable'); assert.ok(fallback.recommendations.length);
  assert.equal((await f.send({ budget: -1 })).status, 400);
  assert.equal((await f.send({ section: 'x'.repeat(3000) })).status, 413);
  f.failMenu(); assert.equal((await f.send({})).status, 503);
});
