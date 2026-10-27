// Opt-in live-model smoke test. Uses only the source menu and synthetic requests.
const assert = require('node:assert/strict');
const { cloudConfig, createCloudInterpreter } = require('../server/cloud-chat');
const { initialState } = require('../server/chat-intent');
const { items } = require('../server/menu-catalog.cjs');
(async () => {
  const config = cloudConfig(process.env);
  if (!config) throw new Error('Set GEMINI_API_KEY and optionally GEMINI_MODEL in .env first.');
  const interpret = createCloudInterpreter(config);
  const signal = new AbortController().signal;
  const first = await interpret('I would like coffee under PHP 150', initialState(), items, signal);
  assert.equal(first.intent, 'recommend'); assert.equal(first.state.category, 'coffee'); assert.equal(first.state.budget, 150);
  console.log('PASS live AI: coffee and PHP 150 price limit');
  const second = await interpret('make it cold', first.state, items, signal);
  assert.equal(second.intent, 'recommend'); assert.equal(second.state.temperature, 'cold'); assert.equal(second.state.budget, 150);
  console.log('PASS live AI: cold follow-up retains price limit');
  const third = await interpret('desserts instead', second.state, items, signal);
  assert.equal(third.intent, 'recommend'); assert.equal(third.state.category, 'sweet'); assert.equal(third.state.temperature, 'any'); assert.equal(third.state.budget, 150);
  console.log('PASS live AI: category switch clears temperature and retains price limit');
})().catch(error => { console.error('Cloud AI verification failed:', error.message); process.exitCode = 1; });
