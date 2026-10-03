const {test}=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('../server/app');
test('single trusted ingress separates clients and ignores spoofed leftmost addresses',async t=>{
  const app=createApp({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',TRUST_PROXY_HOPS:'1'});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const send=xff=>fetch('http://127.0.0.1:'+server.address().port+'/api/config',{headers:{'X-Forwarded-For':xff}});
  for(let i=0;i<60;i++)assert.equal((await send('198.51.100.10')).status,200);
  assert.equal((await send('198.51.100.10')).status,429);
  assert.equal((await send('203.0.113.99, 198.51.100.10')).status,429);
  assert.equal((await send('198.51.100.11')).status,200);
});
