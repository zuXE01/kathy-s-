const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const { validateItem } = require('../server/admin');
const config = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
const item = { name: ' Latte ', description: 'Coffee', category: 'coffee', price: 120.50, available: true };
test('menu input validates types, limits and prices and discards extra fields', () => {
  assert.deepEqual(validateItem({ ...item, hub_role: 'admin' }), { ...item, name: 'Latte' });
  for (const invalid of [null, [], {...item,name:''}, {...item,price:-1}, {...item,price:Infinity}, {...item,price:1.001}, {...item,price:'12'}, {...item,price:100001}, {...item,available:'true'}, {...item,category:'other'}, {...item,description:'x'.repeat(501)}]) assert.equal(validateItem(invalid), null);
});
test('public menu query exposes only available catalog fields', async t => {
  const calls = [];
  const query = {};
  for (const method of ['select','eq','order','limit']) query[method] = (...args) => { calls.push([method,...args]); return query; };
  query.then = resolve => Promise.resolve({data:[],error:null}).then(resolve);
  const app = createApp(config, () => ({from(table) { assert.equal(table,'menu_items'); return query; }}));
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/menu`);
  assert.equal(response.status,200); assert.deepEqual(await response.json(),{items:[]});
  assert.ok(calls.some(call => call[0]==='eq' && call[1]==='available' && call[2]===true));
  assert.ok(calls.some(call => call[0]==='select' && call[1]==='id,name,description,category,price'));
});
test('admin routes deny anonymous, invalid, ordinary and forged-metadata users before database access', async t => {
  let queries = 0;
  const app = createApp(config, () => ({ auth: { getUser: async token => token === 'invalid' ? {data:{user:null},error: true} : { data: { user: { email:'member@example.com', user_metadata:{hub_role:'admin'}, app_metadata:{} } } } }, from() { queries++; throw new Error('Must not query'); } }));
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [token,status] of [[null,401],['invalid',401],['member',403]]) {
    for (const [path,method] of [['overview','GET'],['members','GET'],['menu','GET'],['menu','POST'],['menu/00000000-0000-0000-0000-000000000000','PUT'],['menu/00000000-0000-0000-0000-000000000000','DELETE']]) {
      assert.equal((await fetch(origin+'/api/admin/'+path, { method, headers: token ? {Authorization:'Bearer '+token} : {} })).status,status);
    }
  }
  assert.equal(queries,0);
});
test('verified admin can manage menu, view limited profiles, and receives validation errors', async t => {
  const calls = [];
  const id = '00000000-0000-4000-8000-000000000001';
  const app = createApp(config, (_url,_key,options) => {
    assert.equal(options.global.headers.Authorization, 'Bearer admin');
    return { auth: { getUser: async () => ({data:{user:{email:'admin@example.com',app_metadata:{hub_role:'admin'}}}}) }, from(table) {
      const query = { result:{data:[],count:2,error:null}, then(resolve,reject) { return Promise.resolve(this.result).then(resolve,reject); } };
      for(const method of ['select','order','range','eq','limit','insert','update','delete','single','maybeSingle']) query[method] = function(...args) {
        calls.push({table,method,args});
        if (method === 'single' || method === 'maybeSingle') this.result.data = {id,...item};
        return this;
      };
      return query;
    } };
  });
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}/api/admin`;
  const send = (path,method='GET',body) => fetch(origin+path,{method,headers:{Authorization:'Bearer admin','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const overview = await send('/overview'); assert.equal(overview.status,200); assert.equal(overview.headers.get('cache-control'),'no-store'); assert.equal((await overview.json()).members,2);
  assert.equal((await send('/members')).status,200);
  assert.ok(calls.some(call => call.table==='profiles' && call.method==='select' && call.args[0]==='id,name,created_at'));
  assert.equal((await send('/members?page=-1')).status,400);
  assert.equal((await send('/menu')).status,200);
  assert.equal((await send('/menu','POST',item)).status,201);
  assert.equal((await send('/menu/'+id,'PUT',item)).status,200);
  assert.equal((await send('/menu/'+id,'DELETE')).status,200);
  assert.equal((await send('/menu','POST',{})).status,400);
  assert.equal((await send('/menu/bad','DELETE')).status,400);
  assert.equal((await send('/menu','POST',{...item,description:'x'.repeat(9000)})).status,413);
});
