const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
function fixture(fetch) {
  const nodes = {}, events = {}, timers = [];
  const element = () => ({ value: '', checked: false, attrs: {}, handlers: {}, children: [],
    addEventListener(name, fn) { this.handlers[name] = fn; }, setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; }, append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; }, querySelector() { return node('submit'); } });
  const node = id => nodes[id] ||= element();
  node('recommendationGroup').value = 'all'; node('mobileMenuSection').value = 'all';
  let authChanged;
  const context = { document: { getElementById: node, createElement: element, body: { dataset: { menuAccess: 'guest' } } },
    window: { addEventListener(name, fn) { events[name] = fn; } }, AbortController, fetch,
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
    createMenuCard: (item, options) => ({ ...element(), item, options }), addToCart() {},
    getAuthClient: async () => ({ auth: { onAuthStateChange(fn) { authChanged = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session: { access_token: 'alice' } } }) } }) };
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../public/js/recommendations.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), context);
  return { node, events, timers, submit: () => node('recommendationForm').handlers.submit({ preventDefault() {} }),
    switch: async id => { await Promise.resolve(); authChanged('SIGNED_IN', id ? { user: { id } } : null); } };
}
const result = { history: 'off', recommendations: [{ item: { id: 'a' }, reasons: ['Matches your selected menu group.'] }] };
test('guest suggestions render without cart actions; history is explicit and auth changes clear private results', async () => {
  const calls = [];
  const f = fixture(async (_path, options) => { calls.push(options); return { ok: true, json: async () => result }; });
  await f.submit(); assert.equal(f.node('recommendationGrid').children.length, 1);
  assert.equal(f.node('recommendationGrid').children[0].options.onAdd, undefined);
  assert.equal(calls[0].headers.Authorization, undefined);
  await f.switch('alice'); f.node('recommendationHistory').checked = true;
  await f.submit(); assert.equal(calls[1].headers.Authorization, 'Bearer alice');
  assert.equal(JSON.parse(calls[1].body).useHistory, true);
  assert.equal(typeof f.node('recommendationGrid').children[0].options.onAdd, 'function');
  await f.switch('bob'); assert.equal(f.node('recommendationGrid').children.length, 0);
  assert.equal(f.node('recommendationHistory').checked, false);
  await f.switch(null); assert.equal(f.node('recommendationHistory').disabled, true);
});
test('late responses cannot repopulate suggestions after sign-out or a preference edit', async () => {
  let resolve;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  const pending = f.submit(); await f.switch(null);
  f.events['customer-access-changed']({ detail: { signedIn: false } });
  resolve({ ok: true, json: async () => result }); await pending;
  assert.equal(f.node('recommendationGrid').children.length, 0);
  const second = f.submit(); f.node('recommendationForm').handlers.input();
  resolve({ ok: true, json: async () => result }); await second;
  assert.equal(f.node('recommendationGrid').children.length, 0);
});
test('failures show retry guidance and restore submit state', async () => {
  const f = fixture(async () => { throw new Error('Unavailable. Please retry.'); });
  await f.submit(); assert.match(f.node('recommendationStatus').textContent, /retry/);
  assert.equal(f.node('recommendationStatus').attrs['data-error'], 'true');
  assert.equal(f.node('submit').disabled, false); assert.equal(f.node('recommendationGrid').attrs['aria-busy'], 'false');
});
