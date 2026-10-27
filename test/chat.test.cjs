const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { chatRouter } = require('../server/chat');
const { initialState, basicIntent, filterChatMenu, cleanIntent } = require('../server/chat-intent');
const { ollamaConfig, createOllamaInterpreter } = require('../server/ollama-chat');
const menu = [
  { id: 'coffee', name: 'Americano', category: 'coffee', section: 'Coffee', available: true, variants: [{ label: 'Hot', price: 100 }, { label: 'Cold', price: 135 }] },
  { id: 'matcha', name: 'Matcha Latte', category: 'coffee', section: 'Non Coffee', available: true, variants: [{ label: 'Hot', price: 120 }, { label: 'Cold', price: 145 }] },
  { id: 'cake', name: 'Chocolate Cake', category: 'sweet', section: 'Desserts', available: true, price: 99 },
  { id: 'addon', name: 'Extra Milk', category: 'coffee', section: 'Drink Add-ons', available: true, price: 10 }
];
test('chat follows category, budget, named item and explicit temperature across turns', () => {
  let result = basicIntent('coffee under PHP 150', initialState(), menu);
  assert.equal(result.state.budget, 150); assert.equal(result.state.section, 'Coffee');
  result = basicIntent('make it cold', result.state, menu);
  assert.equal(result.state.budget, 150); assert.equal(result.state.temperature, 'cold');
  const filtered = filterChatMenu(menu, result.state);
  assert.equal(filtered[0].variants.length, 1); assert.equal(filtered[0].variants[0].label, 'Cold');
  result = basicIntent('desserts instead', result.state, menu);
  assert.equal(result.state.category, 'sweet'); assert.equal(result.state.temperature, 'any'); assert.equal(result.state.budget, 150);
  result = basicIntent('matcha', result.state, menu);
  assert.equal(result.state.query, 'matcha'); assert.equal(filterChatMenu(menu, result.state)[0].id, 'matcha');
  const actualMenu = require('../server/menu-catalog.cjs').items;
  const pizza = basicIntent('pizza please', initialState(), actualMenu);
  assert.equal(pizza.state.query, 'pizza'); assert.ok(filterChatMenu(actualMenu, pizza.state).every(item => item.section === 'Pizza Thin Crust'));
  const tea = basicIntent('tea please', initialState(), actualMenu);
  assert.equal(tea.state.query, 'tea');
  assert.equal(basicIntent('non-coffee drinks', initialState(), actualMenu).state.section, 'Non Coffee');
});
test('allergy requests stay blocked across follow-ups until explicit reset; no inferred dietary claims', () => {
  const allergy = basicIntent('I have a nut allergy', initialState(), menu);
  assert.equal(allergy.intent, 'dietary');
  assert.equal(basicIntent('coffee', allergy.state, menu).intent, 'dietary');
  assert.equal(basicIntent('start over', allergy.state, menu).state.restricted, false);
  assert.equal(basicIntent('not sweet', initialState(), menu).intent, 'unsupported');
  assert.equal(basicIntent('not coffee', initialState(), menu).intent, 'unsupported');
  assert.equal(basicIntent('coffee under -1', initialState(), menu).intent, 'budget');
  assert.equal(basicIntent('no budget limit but avoid coffee', initialState(), menu).intent, 'unsupported');
  assert.equal(basicIntent('cheaper', initialState(), menu).intent, 'budget');
});
test('model configuration and output reject unknown states, sections and invalid prices', () => {
  assert.equal(ollamaConfig({}), null);
  assert.throws(() => ollamaConfig({ CHAT_AI_ENABLED: 'true' }));
  assert.throws(() => ollamaConfig({ CHAT_AI_ENABLED: 'true', OLLAMA_URL: 'file:///tmp', OLLAMA_MODEL: 'test' }));
  assert.equal(cleanIntent({ intent: 'recommend', state: { ...initialState(), section: 'Imaginary' } }, menu), null);
  assert.equal(cleanIntent({ intent: 'recommend', state: { ...initialState(), budget: -5 } }, menu), null);
  const missing = initialState(); delete missing.budget;
  assert.equal(cleanIntent({ intent: 'recommend', state: missing }, menu), null);
});
test('Ollama requests structured extraction only, validates output and never includes account history', async () => {
  let captured;
  const desired = { intent: 'recommend', state: { ...initialState(), category: 'coffee', budget: 150 } };
  const interpret = createOllamaInterpreter({ endpoint: 'http://127.0.0.1:11434/api/chat', model: 'test' }, async (_url, options) => {
    captured = JSON.parse(options.body);
    return new Response(JSON.stringify({ message: { content: JSON.stringify(desired) } }));
  });
  assert.deepEqual(await interpret('a drink below 150 pesos', initialState(), menu, new AbortController().signal), desired);
  assert.equal(captured.stream, false); assert.equal(captured.format.type, 'object');
  assert.equal(captured.messages.length, 2); assert.doesNotMatch(JSON.stringify(captured), /user_id|access_token|completed.*items/);
  const malformed = createOllamaInterpreter({ endpoint: 'http://local/api/chat', model: 'test' }, async () => new Response(JSON.stringify({ message: { content: '{bad' } })));
  await assert.rejects(malformed('hello', initialState(), menu, new AbortController().signal));
});
async function fixture(t, interpret) {
  const reads = []; let historyFails = false, menuFails = false;
  const client = (_url, _key, options = {}) => {
    const token = options.global?.headers?.Authorization?.slice(7);
    return { auth: { getUser: async () => ({ data: { user: token === 'invalid' ? null : { id: token, is_anonymous: token === 'anonymous' } } }) },
      from(table) {
        const filters = []; let columns;
        return { select(value) { columns = value; return this; }, eq(key, value) { filters.push([key, value]); return this; },
          order() { return this; }, range() { return this; },
          then(resolve, reject) {
            reads.push({ table, filters, columns });
            if (table === 'orders' && historyFails || table === 'menu_items' && menuFails) return Promise.reject(new Error('offline')).then(resolve, reject);
            return Promise.resolve({ data: table === 'menu_items' ? menu : token === 'alice' ? [{ status: 'completed', items: [{ product_id: 'cake' }] }] : [] }).then(resolve, reject);
          } };
      } };
  };
  const app = express(); app.use('/api/chat', chatRouter('https://example.supabase.co', 'sb_publishable_test', client, {}, { interpret }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { reads, failHistory() { historyFails = true; }, failMenu() { menuFails = true; },
    send: (body, token) => fetch('http://127.0.0.1:' + server.address().port + '/api/chat', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }) };
}
test('chat returns live budget-safe portions, excludes add-ons, and does not turn chat into order writes', async t => {
  const f = await fixture(t);
  const response = await f.send({ message: 'drinks under PHP 150' });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json(); assert.equal(result.mode, 'basic');
  assert.ok(result.recommendations.length); assert.ok(result.recommendations.every(entry => entry.item.id !== 'addon'));
  const checkout = await (await f.send({ message: 'place my order' })).json();
  assert.equal(checkout.recommendations.length, 0); assert.match(checkout.reply, /does not place/);
  assert.equal(f.reads.some(read => read.table === 'orders'), false);
});
test('chat history requires explicit opt-in and verified owner; a forged user ID is ignored', async t => {
  const f = await fixture(t);
  const off = await (await f.send({ message: 'my usual' })).json();
  assert.match(off.reply, /turn on Use my completed orders/); assert.equal(f.reads.some(read => read.table === 'orders'), false);
  assert.equal((await f.send({ message: 'my usual', useHistory: true })).status, 401);
  assert.equal((await f.send({ message: 'my usual', useHistory: true }, 'invalid')).status, 401);
  assert.equal((await f.send({ message: 'my usual', useHistory: true }, 'anonymous')).status, 401);
  const alice = await (await f.send({ message: 'my usual', useHistory: true, user_id: 'bob' }, 'alice')).json();
  assert.equal(alice.recommendations[0].item.id, 'cake'); assert.equal(alice.history, 'used');
  const read = f.reads.find(item => item.table === 'orders'); assert.deepEqual(read.filters, [['user_id', 'alice'], ['status', 'completed']]);
  assert.equal(read.columns, 'items,status'); assert.doesNotMatch(JSON.stringify(alice), /user_id|customer|address/);
  const bob = await (await f.send({ message: 'my usual', useHistory: true }, 'bob')).json(); assert.equal(bob.history, 'empty');
  f.failHistory(); const fallback = await (await f.send({ message: 'my usual', useHistory: true }, 'alice')).json();
  assert.equal(fallback.history, 'unavailable'); assert.match(fallback.reply, /could not be loaded/);
});
test('AI failure has an honest basic fallback; catalog errors and invalid messages recover cleanly', async t => {
  const f = await fixture(t, async () => { throw new Error('Ollama unavailable'); });
  const result = await (await f.send({ message: 'coffee under 150' })).json();
  assert.equal(result.mode, 'fallback'); assert.ok(result.recommendations.length);
  assert.equal((await f.send({ message: ' ' })).status, 400);
  assert.equal((await f.send({ message: 'x'.repeat(501) })).status, 400);
  assert.equal((await f.send({ message: 'coffee', state: { category: 'coffee' } })).status, 400);
  f.failMenu(); assert.equal((await f.send({ message: 'coffee' })).status, 503);
});
test('AI cannot generate rendered product data or bypass allergy restrictions', async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return { intent: 'recommend', state: { ...initialState(), category: 'coffee', budget: 100 }, inventedProduct: 'Free item' }; });
  const result = await (await f.send({ message: 'a nice drink under 100' })).json();
  assert.equal(result.mode, 'ai'); assert.equal(result.recommendations.length, 1); assert.equal(result.recommendations[0].item.id, 'coffee');
  const allergy = await (await f.send({ message: 'I have a dairy allergy' })).json();
  assert.equal(allergy.recommendations.length, 0); assert.equal(calls, 1);
});
