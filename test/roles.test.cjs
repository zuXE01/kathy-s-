const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {roleForUser,allowedOrderStatuses}=require('../server/roles');
const {createApp}=require('../server/app');

test('roles trust only known app metadata and kitchen capabilities are limited',()=>{
  for(const role of ['customer','staff','kitchen_staff','owner','platform_admin'])assert.equal(roleForUser({app_metadata:{hub_role:role}}),role);
  for(const role of ['constructor','__proto__','toString','unknown',null])assert.equal(roleForUser({app_metadata:{hub_role:role}}),'customer');
  assert.equal(roleForUser({user_metadata:{hub_role:'owner'}}),'customer');
  assert.equal(roleForUser({app_metadata:{hub_role:'admin'}}),'owner');
  const statuses=['accepted','preparing','ready','completed','rejected','cancelled'];
  assert.deepEqual(allowedOrderStatuses('kitchen_staff',statuses),['preparing','ready']);
  assert.deepEqual(allowedOrderStatuses('customer',statuses),[]);
  assert.deepEqual(allowedOrderStatuses('staff',statuses),statuses);
});

test('staff overview reads only orders and kitchen API rejects forbidden writes',async t=>{
  const calls=[];
  const id='00000000-0000-4000-8000-000000000001';
  const app=createApp({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},(_url,_key,options)=>{
    const role=options.global.headers.Authorization.split(' ')[1];
    return {auth:{getUser:async()=>({data:{user:{id,email:'staff@example.test',app_metadata:{hub_role:role}}}})},from(table){
      calls.push(table);
      let data=[{id,status:'accepted',version:1}];
      const query={then(resolve,reject){return Promise.resolve({data,count:2,error:null}).then(resolve,reject);}};
      for(const method of ['select','eq','order','range'])query[method]=()=>query;
      query.update=body=>{data={id,...body,version:2};return query;};
      query.maybeSingle=()=>query;
      return query;
    }};
  });
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const send=(path,method='GET',body)=>fetch(`http://127.0.0.1:${server.address().port}/api/admin${path}`,{method,headers:{Authorization:'Bearer kitchen_staff','Content-Type':'application/json'},body:body&&JSON.stringify(body)});
  const overview=await (await send('/overview')).json();
  assert.deepEqual(overview.orderCounts,{accepted:2,preparing:2,ready:2});
  assert.equal(overview.members,undefined);assert.ok(calls.every(table=>table==='orders'));
  const listing=await (await send('/orders')).json();
  assert.deepEqual(listing.items[0].allowed_statuses,['preparing']);
  const before=calls.length;
  for(const status of ['accepted','completed','rejected','cancelled']){
    const result=await send('/orders/'+id,'PATCH',{status,version:1,note:'Test reason'});
    assert.equal(result.status,403);assert.equal((await result.json()).code,'ACTION_FORBIDDEN');
  }
  assert.equal(calls.length,before);
  const updated=await send('/orders/'+id,'PATCH',{status:'preparing',version:1});
  assert.equal(updated.status,200);assert.deepEqual((await updated.json()).order.allowed_statuses,['ready']);
});

test('action denials keep the workspace open; authentication denials close it',async()=>{
  const source=readFileSync(require.resolve('../public/js/admin/request.js'),'utf8').replace(/^import .*;\r?\n/,'').replaceAll('export ','');
  for(const [status,code,expected] of [[403,'ACTION_FORBIDDEN',0],[403,undefined,0],[403,'WORKSPACE_ACCESS_DENIED',1],[401,undefined,1]]){
    const events=[];
    const context=vm.createContext({getAuthClient:async()=>({auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}}),fetch:async()=>({ok:false,status,json:async()=>({error:'Denied',code})}),window:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type){this.type=type;}}});
    vm.runInContext(source,context);
    await new Promise(resolve=>context.request('/orders',{},error=>{assert.equal(error.status,status);resolve();}));
    assert.equal(events.length,expected);
  }
});
