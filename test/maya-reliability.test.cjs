const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const express=require('express');
const {createReliablePaymentService,startPaymentWorker}=require('../server/maya-reliability.cjs');
const {mayaRouter}=require('../server/maya-payments.cjs');
const {adminRouter}=require('../server/admin');
const {createApp}=require('../server/app');
function adapter(db){
 return {
  async rpc(name,args={}){try{const entries=Object.entries(args),query='select public.'+name+'('+entries.map(([key],i)=>key+'=> $'+(i+1)).join(',')+') as value';return {data:(await db.query(query,entries.map(([,value])=>value))).rows[0]?.value};}catch(error){return {error};}},
  from(table){let fields='*',where=[],values=[],sort=[],offset=0,count=1000,wantCount=false;
   const q={select(columns='*',options={}){fields=columns;wantCount=options.count==='exact';return q;},eq(k,v){values.push(v);where.push(k+'=$'+values.length);return q;},in(k,v){values.push(v);where.push(k+'=any($'+values.length+'::uuid[])');return q;},order(k,options={}){sort.push(k+(options.ascending===false?' desc':' asc'));return q;},range(start,end){offset=start;count=end-start+1;return q;},limit(n){count=n;return q;},async maybeSingle(){const r=await q;return {...r,data:r.data?.[0]||null};},async then(resolve,reject){try{const base=' from public.'+table+(where.length?' where '+where.join(' and '):'');const result=await db.query('select '+fields+base+(sort.length?' order by '+sort.join(','):'')+' limit '+count+' offset '+offset,values);const total=wantCount?Number((await db.query('select count(*)'+base,values)).rows[0].count):undefined;return resolve({data:result.rows,count:total});}catch(error){return resolve({error});}}};return q;}
 };
}
async function fixture(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;
 insert into auth.users(id) values ('00000000-0000-4000-8000-000000000010');`);
 for(const file of ['schema.sql','admin-setup.sql','menu-catalog-setup.sql','customer-details-setup.sql','orders-setup.sql','maya-sandbox-setup.sql','maya-cancellation-setup.sql','maya-reliability-setup.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
 await db.exec(`insert into public.menu_items(name,category,price,section,variants) values('Test coffee','coffee',100,'Coffee','[{"label":"Hot","price":100}]');`);
 async function order(){
  await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000010","app_metadata":{}}',false);`);
  const result=await db.query(`insert into public.orders(user_id,request_id,request_hash,customer,items,total_cents,payment_method)
   select auth.uid(),gen_random_uuid(),repeat('a',64),'{"name":"Demo","email":"demo@example.test","phone":"09123456789","address":"Test","barangay":"Test","city":"Test","province":"Test","postal":"1000","notes":""}',
   jsonb_build_array(jsonb_build_object('product_id',id,'label','Hot','quantity',1)),10000,'maya-sandbox' from public.menu_items limit 1 returning id,user_id,items,total_cents,delivery_cents,payment_method,status`);
  await db.exec('reset role;set role service_role;');return result.rows[0];
 }
 const client=adapter(db),provider=new Map();let creates=0,failCreation;
 const maya={async create(row){creates++;if(failCreation)throw failCreation;const checkout_id=randomUUID();provider.set(row.id,{checkout_id,status:'PENDING_TOKEN'});return {checkout_id,redirect_url:'https://payments-web-sandbox.maya.ph/test'};},async retrieve(row){const result=provider.get(row.id);if(!result)throw Object.assign(new Error('not found'),{providerStatus:404});return {id:result.checkout_id,requestReferenceNumber:row.id,amount:'100.00',currency:'PHP',status:result.status,isPaid:result.status==='PAYMENT_SUCCESS'};},async cancel(row){provider.get(row.id).status='PAYMENT_CANCELLED';}};
 return {db,client,order,provider,maya,service:createReliablePaymentService(client,maya),get creates(){return creates},set failCreation(error){failCreation=error}};
}
test('sandbox reliability database and service preserve attempts, recover payments and protect retries',async t=>{
 const f=await fixture(t),{db,service}=f;
 await t.test('simultaneous starts create one provider session and persist audit events',async()=>{
   const order=await f.order();const rows=await Promise.all([service.start(order),service.start(order)]);
   assert.equal(f.creates,1);assert.equal(rows[0].current_attempt_id,rows[1].current_attempt_id);assert.equal((await service.find(order.id)).status,'pending');
   assert.deepEqual((await service.audit(order.id)).map(e=>e.event),['created','attempt_claimed']);
 });
 await t.test('durable recovery confirms a successful payment without a browser return',async()=>{
   const order=await f.order(),row=await service.start(order);f.provider.get(row.current_attempt_id).status='PAYMENT_SUCCESS';
   await service.enqueue(row.current_attempt_id);await service.reconcile();assert.equal((await service.find(order.id)).status,'sandbox-paid');
   assert.ok((await service.find(order.id)).last_verified_at);
 });
 await t.test('unknown creation and 404 lookup cannot start another checkout',async()=>{
   const order=await f.order(),before=f.creates;f.failCreation=new Error('timeout');await assert.rejects(service.start(order),/uncertain/);f.failCreation=null;
   const row=await service.find(order.id);await assert.rejects(service.retry(order,row.current_attempt_id));await service.start(order);assert.equal(f.creates,before+1);
   f.provider.set(row.current_attempt_id,{checkout_id:randomUUID(),status:'PAYMENT_SUCCESS'});await service.enqueue(row.current_attempt_id);await service.reconcile();assert.equal((await service.find(order.id)).status,'sandbox-paid');
 });
 await t.test('explicit rejected creation can recover with another attempt on the same order',async()=>{
   const order=await f.order();f.failCreation=Object.assign(new Error('invalid request'),{creationRejected:true});await assert.rejects(service.start(order),/rejected/);f.failCreation=null;
   const old=await service.find(order.id),fresh=await service.retry(order,old.current_attempt_id);assert.notEqual(old.current_attempt_id,fresh.current_attempt_id);assert.equal(fresh.status,'pending');
   assert.equal((await db.query('select count(*)::int as count from public.maya_payment_attempts where order_id=$1',[order.id])).rows[0].count,2);
 });
 await t.test('failed payment retries serialize; a late old success stops the new unpaid attempt',async()=>{
   const order=await f.order(),old=await service.start(order);f.provider.get(old.current_attempt_id).status='PAYMENT_FAILED';await service.verify(old);
   const before=f.creates;const results=await Promise.allSettled([service.retry(order,old.current_attempt_id),service.retry(order,old.current_attempt_id)]);assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.creates,before+1);
   const fresh=await service.find(order.id);f.provider.get(old.current_attempt_id).status='PAYMENT_SUCCESS';await service.enqueue(old.current_attempt_id);await service.reconcile();
   assert.equal((await service.find(order.id)).status,'sandbox-paid');assert.equal(f.provider.get(fresh.current_attempt_id).status,'PAYMENT_CANCELLED');await assert.rejects(service.retry(order,fresh.current_attempt_id));
 });
 await t.test('cancellation before first start prevents creating a session',async()=>{
   const order=await f.order(),before=f.creates;await service.beforeClose(order,'cancelled');assert.equal((await service.start(order)).status,'cancelled');assert.equal(f.creates,before);
 });
 await t.test('a provider-confirmed failed checkout can close without an open session',async()=>{
   const order=await f.order(),row=await service.start(order);f.provider.get(row.current_attempt_id).status='PAYMENT_FAILED';
   await service.beforeClose(order,'cancelled');assert.equal((await service.find(order.id)).status,'cancelled');
 });
 await t.test('investigation exposes safe fields and preserves earlier attempts',async()=>{
   const result=await service.investigate(1,'all');assert.ok(result.items.length);
   assert.ok(result.items.some(row=>row.attempts===2));assert.equal(result.items[0].checkout_id,undefined);assert.equal(result.items[0].user_id,undefined);assert.equal(result.items[0].redirect_url,undefined);
 });
 await t.test('queue leases survive duplicates, reject stale acknowledgements and dead-letter repeated failures',async()=>{
   const reference=randomUUID();await f.client.rpc('hub_maya_enqueue',{p_reference:reference});
   const job=(await f.client.rpc('hub_maya_take_job')).data;assert.ok(job);assert.equal((await f.client.rpc('hub_maya_take_job')).data,null);
   await f.client.rpc('hub_maya_enqueue',{p_reference:reference});await f.client.rpc('hub_maya_finish_job',{p_reference:reference,p_token:job.lease_token,p_revision:job.revision,p_ok:true});
   assert.equal((await db.query('select count(*)::int as count from public.maya_payment_jobs where reference=$1',[reference])).rows[0].count,1);
   for(let i=0;i<12;i++){await db.query('update public.maya_payment_jobs set due_at=now() where reference=$1',[reference]);const next=(await f.client.rpc('hub_maya_take_job')).data;assert.ok(next);await f.client.rpc('hub_maya_finish_job',{p_reference:reference,p_token:next.lease_token,p_revision:next.revision,p_ok:false});}
   assert.ok((await db.query('select dead_at from public.maya_payment_jobs where reference=$1',[reference])).rows[0].dead_at);
 });
 await t.test('browser roles cannot invoke privileged RPCs or read/write audit and jobs',async()=>{
   await db.exec('reset role;set role authenticated;');
   for(const query of ['select public.hub_maya_schedule()','select * from public.maya_payment_audit','select * from public.maya_payment_jobs','select * from public.maya_payment_attempts','select * from public.maya_payment_investigations'])await assert.rejects(db.query(query),/permission denied/);
   await db.exec('reset role;set role service_role;');await assert.rejects(db.query("update public.maya_payment_audit set event='forged'"),/permission denied/);
 });
 await t.test('needs-attention is filtered before pagination and does not bury old unresolved payments',async()=>{
   const unresolved=await f.order();await service.start(unresolved);await db.query("update public.maya_sandbox_payments set updated_at='2000-01-01' where order_id=$1",[unresolved.id]);
   for(let i=0;i<21;i++){const order=await f.order(),row=await service.start(order);f.provider.get(row.current_attempt_id).status='PAYMENT_SUCCESS';await service.verify(row);}
   const attention=await service.investigate();assert.equal(attention.items[0].order_id,unresolved.id);assert.ok(attention.items.every(row=>row.needs_attention));
   const all=await service.investigate(1,'all');assert.equal(all.items.length,20);assert.ok(!all.items.some(row=>row.order_id===unresolved.id));
 });
});
async function listen(t,app){const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));return 'http://127.0.0.1:'+server.address().port;}
test('durable webhook acknowledges storage without waiting for provider and rejects forged sources',async t=>{
 let queued=0,fail=false;const app=express();app.set('trust proxy',1);app.use('/pay',mayaRouter({config:{},url:'x',key:'pub',secret:'secret',createClient:()=>({}),paymentService:{enqueue:async()=>{if(fail)throw Error('db down');queued++;},verify:()=>{throw Error('provider must not run inline')}}}));const base=await listen(t,app),reference=randomUUID();
 const send=ip=>fetch(base+'/pay/webhook',{method:'POST',headers:{'X-Forwarded-For':ip,'Content-Type':'application/json'},body:JSON.stringify({requestReferenceNumber:reference,paymentStatus:'PAYMENT_SUCCESS'})});
 assert.equal((await send('192.0.2.1')).status,403);assert.equal(queued,0);assert.equal((await send('13.229.160.234')).status,200);assert.equal(queued,1);fail=true;assert.equal((await send('13.229.160.234')).status,503);
});
test('payment investigation restricts customer and kitchen access and has no mark-paid route',async t=>{
 let calls=0;const createClient=(_url,_key,options)=>({auth:{getUser:async()=>({data:{user:{id:randomUUID(),app_metadata:{hub_role:options.global.headers.Authorization.slice(7)}}}})}});
 const app=express();app.use('/admin',adminRouter('x','key',createClient,{investigate:async()=>{calls++;return {items:[]}},find:async()=>({}),verify:async()=>{},audit:async()=>[]}));const base=await listen(t,app);
 for(const role of ['customer','kitchen_staff'])assert.equal((await fetch(base+'/admin/payments',{headers:{Authorization:'Bearer '+role}})).status,403);
 assert.equal(calls,0);for(const role of ['owner','staff','platform_admin'])assert.equal((await fetch(base+'/admin/payments',{headers:{Authorization:'Bearer '+role}})).status,200);
 assert.equal((await fetch(base+'/admin/payments/'+randomUUID()+'/mark-paid',{method:'POST',headers:{Authorization:'Bearer owner'}})).status,404);
});
test('worker prevents overlapping passes and stops scheduling on shutdown',async()=>{
 let calls=0,release;const service={reconcile:()=>{calls++;return new Promise(resolve=>{release=resolve})}};
 const stop=startPaymentWorker(service,{intervalMs:5});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(calls,1);stop();release();await new Promise(resolve=>setTimeout(resolve,15));assert.equal(calls,1);
});
test('webhooks have an independent limit even when the normal API bucket is exhausted',async t=>{
 const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null})})};
 const app=createApp({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'secret',MAYA_SANDBOX_ENABLED:'true',MAYA_SANDBOX_PUBLIC_DEMO:'true',TRUST_PROXY_HOPS:'1'},()=>db);
 const base=await listen(t,app),headers={'X-Forwarded-For':'13.229.160.234'};
 for(let i=0;i<60;i++)assert.equal((await fetch(base+'/api/config',{headers})).status,200);
 assert.equal((await fetch(base+'/api/config',{headers})).status,429);
 assert.equal((await fetch(base+'/api/payments/maya/webhook',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({requestReferenceNumber:randomUUID()})})).status,200);
});
