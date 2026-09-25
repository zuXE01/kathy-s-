const {test}=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('../server/app');
const {validateOrder}=require('../server/orders');
const {createOrderFixture}=require('./order-fixture.cjs');
const {randomUUID}=require('node:crypto');
const menu=[{id:'00000000-0000-4000-8000-000000000001',name:'Coffee',section:'Coffee',available:true,variants:[{label:'Cold',price:135}]}];
const payload=()=>({request_id:randomUUID(),customer:{name:'Demo',email:'demo@example.test',phone:'09123456789',address:'123 Sample',barangay:'Sample',city:'Manila',province:'Metro Manila',postal:'1000',notes:''},items:[{product_id:menu[0].id,label:'Cold',quantity:2}],total_cents:27000,payment_method:'cod'});
async function setup(t) {
  const fixture=createOrderFixture(menu);
  const app=createApp({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},fixture.client);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {...fixture,send:(path,token='member',method='GET',body)=>fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})};
}
test('order validation strips untrusted fields and rejects bad totals, customer data and duplicate items',()=>{
  const input=payload(),valid=validateOrder({...input,status:'completed',payment_status:'paid',user_id:'attacker'});
  assert.ok(valid);assert.equal(valid.status,undefined);assert.equal(valid.request_hash.length,64);
  for(const value of [{...input,items:[]},{...input,items:[...input.items,...input.items]},{...input,total_cents:1.2},{...input,payment_method:'paid'},{...input,customer:{...input.customer,name:' '}},{...input,request_id:'bad'}])assert.equal(validateOrder(value),null);
});
test('order routes reject unsigned/invalid users and non-admin order management',async t=>{
  const {send}=await setup(t);
  assert.equal((await send('/api/orders',null,'POST',payload())).status,401);
  assert.equal((await send('/api/orders','invalid','POST',payload())).status,401);
  assert.equal((await send('/api/admin/orders','member')).status,403);
  assert.equal((await send('/api/admin/orders/'+randomUUID(),'member','PATCH',{status:'accepted',version:1})).status,403);
});
test('saved order is recovered on retry and isolated from another customer',async t=>{
  const {send,orders}=await setup(t),body=payload();
  const created=await send('/api/orders','member','POST',body);assert.equal(created.status,201);
  const record=(await created.json()).order;
  assert.equal(record.total_cents,27000);assert.equal(record.payment_status,'unpaid');
  const again=await send('/api/orders','member','POST',body);assert.equal((await again.json()).order.id,record.id);assert.equal(orders.length,1);
  assert.equal((await send('/api/orders','member','POST',{...body,payment_method:'demo-online'})).status,409);
  const other=await send('/api/orders/request/'+body.request_id,'other');assert.equal((await other.json()).order,null);
  assert.equal((await send('/api/orders/request/'+body.request_id)).headers.get('cache-control'),'no-store');
});
test('simultaneous checkout retries create one order and wrong prices fail',async t=>{
  const {send,orders}=await setup(t),body=payload();
  const responses=await Promise.all([send('/api/orders','member','POST',body),send('/api/orders','member','POST',body)]);
  assert.ok(responses.every(response=>[200,201].includes(response.status)));assert.equal(orders.length,1);
  assert.equal((await send('/api/orders','member','POST',{...payload(),total_cents:1})).status,409);
});
test('admin can filter and progress orders while stale versions and invalid transitions fail',async t=>{
  const {send}=await setup(t);
  const record=(await (await send('/api/orders','member','POST',payload())).json()).order;
  const path='/api/admin/orders/'+record.id;
  assert.equal((await send(path,'admin','PATCH',{status:'completed',version:1})).status,409);
  assert.equal((await send(path,'admin','PATCH',{status:'rejected',version:1})).status,400);
  assert.equal((await send(path,'admin','PATCH',{status:'accepted',version:1})).status,200);
  assert.equal((await send(path,'admin','PATCH',{status:'preparing',version:1})).status,409);
  assert.equal((await (await send('/api/admin/orders?status=pending','admin')).json()).total,0);
  assert.equal((await (await send('/api/admin/orders?status=accepted','admin')).json()).total,1);
  assert.equal((await send('/api/admin/orders?page=-1','admin')).status,400);
  assert.equal((await send(path,'admin','PATCH',{status:'rejected',version:2,note:'Kitchen closed'})).status,200);
});
test('online payment remains explicitly simulated and invalid requests do not save',async t=>{
  const {send,orders}=await setup(t);
  const result=await send('/api/orders','member','POST',{...payload(),payment_method:'demo-online'});
  assert.equal(result.status,201);assert.equal((await result.json()).order.payment_status,'simulated');
  assert.equal((await send('/api/orders','member','POST',{})).status,400);
  assert.equal((await send('/api/orders','member','POST',{...payload(),items:[{product_id:menu[0].id,label:'Missing',quantity:1}]})).status,409);
  assert.equal(orders.length,1);
});
