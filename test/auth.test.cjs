const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadFeature(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../public/js', file), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInNewContext(source, context);
  return context;
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('login and registration delegate to Supabase with profile data and safe redirects', async () => {
  const calls = [];
  const auth = {
    signInWithPassword: body => { calls.push(['login', body]); return { data: { user: { email: body.email }, session: {} } }; },
    signUp: body => { calls.push(['signup', body]); return { data: { user: { email: body.email }, session: null } }; }
  };
  const c = loadFeature('api.js', { window: { location: { origin: 'https://hub.example' } },
    authAction: (run, cb) => Promise.resolve(run({ auth })).then(result => cb(null, result.data)) });
  const run = (p, b) => new Promise((resolve, reject) => c.api(p, b, (e, d) => e ? reject(e) : resolve(d)));
  const login = await run('/api/login', { email: 'member@example.com', password: 'test-only-password' });
  assert.ok(login.session);
  const signup = await run('/api/register', { email: 'new@example.com', password: 'test-only-password', name: 'Member', dob: '2000-01-01', gender: 'Other' });
  assert.equal(signup.session, null);
  assert.equal(calls[1][1].options.emailRedirectTo, 'https://hub.example/');
  assert.equal(calls[1][1].options.data.name, 'Member');
  await assert.rejects(() => run('/api/register', { email: 'bad@example.com', password: 'test-only-password', name: 'Member', dob: '2000-02-30', gender: 'Other' }), /valid birthday/);
  assert.equal(calls.length, 2);
});

test('callback adapter reports errors and calls each callback once', async () => {
  const c = loadFeature('auth-client.js', { fetch: async () => ({ ok: true, json: async () => ({}) }),
    window: { supabase: { createClient: () => ({}) } } });
  let calls = 0;
  c.authAction(() => ({ error: new Error('denied') }), (e, data) => {
    calls++; assert.equal(e.message, 'denied'); assert.equal(data, null);
  });
  await flush();
  assert.equal(calls, 1);
});

function field(value = '') {
  const group = { hidden: false };
  return { value, disabled: false, textContent: '', className: '', hidden: false,
    classList: { add() {}, remove() {} }, focus() {}, addEventListener() {}, closest: () => group };
}
test('password recovery requires a verified recovery event before updating a password', () => {
  const ids = { resetConfirmField: field(), resetConfirm: field(), resetHelp: field() };
  const requests = [];
  let signedOut = 0;
  const auth = {
    resetPasswordForEmail: (email, options) => { requests.push(['email', email, options]); return { data: {} }; },
    updateUser: body => { requests.push(['update', body]); return { data: {} }; },
    signOut: () => { signedOut++; return { data: {} }; }
  };
  const context = { document: { getElementById: id => ids[id] }, window: { location: { origin: 'https://hub.example' } },
    sessionStorage: { removeItem() {} }, goSignedOut() {},
    authAction: (run, cb) => { const r = run({ auth }); cb(null, r.data); } };
  for (const name of ['forgotLink','resetPanel','resetEmail','newPass','cancelReset','confirmReset','loginMsg','lEmail']) context[name] = field();
  const c = loadFeature('password-reset.js', context);
  c.resetEmail.value = 'member@example.com';
  c.newPass.value = 'arbitrary-password';
  c.handleReset();
  assert.equal(requests[0][0], 'email');
  assert.equal(requests[0][2].redirectTo, 'https://hub.example/');
  assert.equal(requests.filter(r => r[0] === 'update').length, 0);
  c.openRecovery();
  c.newPass.value = 'short'; c.handleReset();
  assert.equal(requests.length, 1);
  c.newPass.value = 'new-test-password'; ids.resetConfirm.value = 'different'; c.handleReset();
  assert.equal(requests.length, 1);
  ids.resetConfirm.value = 'new-test-password'; c.handleReset();
  assert.equal(requests[1][0], 'update');
  assert.equal(signedOut, 1);
  assert.equal(c.isRecovering(), false);
  assert.match(c.loginMsg.textContent, /Password updated/);
});
