const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { sandboxConfig, createProvider } = require('../server/lalamove');

const env = {
  LALAMOVE_SANDBOX_ENABLED: 'true', LALAMOVE_API_KEY: 'pk_test_example',
  LALAMOVE_API_SECRET: 'sk_test_example', LALAMOVE_PICKUP_ADDRESS: 'Test pickup',
  LALAMOVE_PICKUP_LAT: '14.5', LALAMOVE_PICKUP_LNG: '121.0',
  LALAMOVE_TEST_PHONE: '+639000000000', SUPABASE_SECRET_KEY: 'test'
};

test('delivery requires explicit sandbox setup and rejects production keys', () => {
  assert.ok(sandboxConfig(env));
  assert.equal(sandboxConfig({ ...env, LALAMOVE_API_SECRET: 'sk_prod_example' }), null);
  assert.equal(sandboxConfig({ ...env, LALAMOVE_PICKUP_LAT: '91' }), null);
});

test('provider signs exactly the transmitted payload and only calls the sandbox', async () => {
  const call = createProvider(sandboxConfig(env), async (url, options) => {
    assert.equal(url, 'https://rest.sandbox.lalamove.com/v3/quotations');
    assert.equal(options.headers.Market, 'PH');
    const [key, time, signature] = options.headers.Authorization.slice(5).split(':');
    assert.equal(key, env.LALAMOVE_API_KEY);
    assert.equal(signature, createHmac('sha256', env.LALAMOVE_API_SECRET)
      .update([time, 'POST', '/v3/quotations', '', options.body].join('\r\n')).digest('hex'));
    assert.deepEqual(JSON.parse(options.body), { data: { serviceType: 'MOTORCYCLE' } });
    return new Response(JSON.stringify({ data: { quotationId: '123' } }));
  });
  assert.deepEqual(await call('POST', '/v3/quotations', { serviceType: 'MOTORCYCLE' }), { quotationId: '123' });
});
