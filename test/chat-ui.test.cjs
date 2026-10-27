const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { initialState } = require('../server/chat-intent');
const flush = () => new Promise(resolve => setImmediate(resolve));
async function fixture(chatFetch) {
  const nodes = {}, events = {}, calls = [], authCallbacks = [];
  function element() {
    return { value: '', checked: false, children: [], attrs: {}, handlers: {}, dataset: {},
      addEventListener(name, handler) { this.handlers[name] = handler; },
      setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; },
      append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); }, replaceChildren() { this.children = []; },
      get firstElementChild() { return this.children[0]; }, remove() { this.parent.children.shift(); },
      querySelectorAll() { return []; }, focus() { this.focused = true; } };
  }
  const node = id => nodes[id] ||= element();
  const session = { user: { id: 'alice' }, access_token: 'alice' };
  const context = { document: { getElementById: node, createElement: element, body: { dataset: { menuAccess: 'member' } } },
    window: { addEventListener(name, handler) { (events[name] ||= []).push(handler); } }, location: { reload() {} },
    setTimeout, clearTimeout, AbortController,
    fetch: async (url, options) => {
      if (url.endsWith('/config')) return { ok: true, json: async () => ({ aiEnabled: false }) };
      calls.push(options); return chatFetch(url, options);
    },
    createMenuCard: (item, options) => ({ ...element(), item, options }), addToCart: () => true,
    getAuthClient: async () => ({ auth: {
      onAuthStateChange(handler) { authCallbacks.push(handler); handler('INITIAL_SESSION', session); return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session } })
    } }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/menu-chat.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), context);
  await flush();
  return { node, calls, send(text) { node('chatMessage').value = text; node('chatForm').handlers.submit({ preventDefault() {} }); },
    dispatch(name, event = {}) { events[name]?.forEach(handler => handler(event)); },
    account(id) { authCallbacks.forEach(handler => handler('SIGNED_IN', id ? { user: { id } } : null)); } };
}
const reply = () => ({ ok: true, json: async () => ({ reply: 'Here are suggestions.', state: { ...initialState(), category: 'coffee', budget: 150 },
  mode: 'basic', history: 'off', recommendations: [{ item: { id: 'a', name: 'Coffee' }, reasons: ['Matches your menu group.'] }] }) });
test('chat keeps follow-up state, enforces opt-in history and gives guests no add action', async () => {
  const f = await fixture(async () => reply());
  f.send('coffee under 150'); await flush();
  assert.equal(f.node('chatResults').children.length, 1); assert.equal(f.calls[0].headers.Authorization, undefined);
  f.send('make it cold'); await flush();
  assert.equal(JSON.parse(f.calls[1].body).state.budget, 150);
  f.node('chatHistory').checked = true; f.node('chatHistory').handlers.change();
  f.send('my usual'); await flush(); assert.equal(f.calls[2].headers.Authorization, 'Bearer alice');
  f.dispatch('customer-access-changed', { detail: { signedIn: false } });
  assert.equal(f.node('chatResults').children.length, 0); assert.equal(f.node('chatHistory').checked, false);
  f.send('drinks'); await flush(); assert.equal(f.node('chatResults').children[0].options.onAdd, undefined);
});
test('duplicate sends are ignored; account switch and new chat discard late responses', async () => {
  let resolve;
  const f = await fixture(() => new Promise(done => { resolve = done; }));
  f.send('coffee'); f.send('desserts'); assert.equal(f.calls.length, 1);
  f.account('bob'); resolve(reply()); await flush();
  assert.equal(f.node('chatResults').children.length, 0); assert.equal(f.node('chatLog').children.length, 1);
  f.send('drinks'); f.node('chatReset').handlers.click(); resolve(reply()); await flush();
  assert.equal(f.node('chatResults').children.length, 0);
  assert.equal(f.node('chatMessage').value, '');
});
test('failed replies can retry without duplicating the user message; new drafts survive successful replies', async () => {
  let fail = true, resolve;
  const f = await fixture(async () => { if (fail) throw new Error('Offline. Retry.'); return new Promise(done => { resolve = done; }); });
  f.send('coffee'); await flush(); assert.equal(f.node('chatRetry').hidden, false);
  assert.equal(f.node('chatSend').disabled, false); assert.equal(f.node('chatMessage').value, 'coffee');
  fail = false; f.node('chatRetry').handlers.click(); await flush();
  f.node('chatMessage').value = 'desserts instead'; resolve(reply()); await flush();
  assert.equal(f.node('chatMessage').value, 'desserts instead');
  assert.equal(f.node('chatLog').children.length, 3);
  assert.equal(f.node('chatRetry').hidden, true);
});
test('page exit clears chat and an unauthorized response removes previous private context', async () => {
  let unauthorized = false;
  const f = await fixture(async () => unauthorized ? { ok: false, status: 401, json: async () => ({ error: 'Expired' }) } : reply());
  f.send('coffee'); await flush(); unauthorized = true;
  f.send('my usual'); await flush(); assert.equal(f.node('chatResults').children.length, 0);
  assert.equal(f.node('chatLog').children.length, 1); assert.equal(f.node('chatHistory').disabled, true);
  assert.match(f.node('chatStatus').textContent, /session could not be verified/);
  f.node('chatMessage').value = 'private draft'; f.dispatch('pagehide');
  assert.equal(f.node('chatMessage').value, '');
});
