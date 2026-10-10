const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {randomUUID}=require('node:crypto');
const {mayaConfig,createMayaClient,sandboxRedirect,verifiedResult}=require('../server/maya-client.cjs');
const {mayaRouter,createPaymentService}=require('../server/maya-payments.cjs');
const {createApp}=require('../server/app');
const {createOrderFixture}=require('./order-fixture.cjs');
const cfg={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
const config=()=>mayaConfig({MAYA_SANDBOX_ENABLED:'true',MAYA_SANDBOX_PUBLIC_DEMO:'true',SUPABASE_SECRET_KEY:'sb_secret_test'});
const order=()=>({id:randomUUID(),user_id:randomUUID(),total_cents:10000,payment_method:'maya-sandbox',status:'pending'});
function fixture(record=order()){
  const rows=[];
  const db={from(table){let filters=[],mode,body,single=false;
    const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},insert(v){mode='insert';body=v;return q},update(v){mode='update';body=v;return q},maybeSingle(){single=true;return q},single(){single=true;return q},
      then(resolve,reject){
        let values=(table==='orders'?[record]:rows).filter(r=>filters.every(f=>f(r))),error;
        if(mode==='insert'){if(rows.some(r=>r.order_id===body.order_id))error={code:'23505'};else{const row={...body};rows.push(row);values=[row];}}
        if(mode==='update')values.forEach(r=>Object.assign(r,body));
        return Promise.resolve({data:error?null:structuredClone(single?values[0]||null:values),error}).then(resolve,reject);
      }};return q;}};
  let creates=0,providerStatus='PAYMENT_SUCCESS';
  const maya={create:async()=>{creates++;return {checkout_id:randomUUID(),redirect_url:'https://payments-web-sandbox.maya.ph/test'};},retrieve:async row=>({id:row.checkout_id||randomUUID(),requestReferenceNumber:row.id,amount:'100.00',currency:'PHP',status:providerStatus,isPaid:providerStatus==='PAYMENT_SUCCESS'})};
  return {db,rows,maya,record,get creates(){return creates},set providerStatus(v){providerStatus=v}};
}
async function server(t,app){const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>s.close(r)));return 'http://127.0.0.1:'+s.address().port;}
test('sandbox is opt-in, requires server storage credentials, and rejects unsafe return origins',()=>{
  assert.equal(mayaConfig({}),null);
  assert.throws(()=>mayaConfig({MAYA_SANDBOX_ENABLED:'true',MAYA_SANDBOX_PUBLIC_DEMO:'true'}),/SUPABASE_SECRET_KEY/);
  for(const origin of ['http://example.com','https://example.com/path','https://user:pass@example.com'])assert.throws(()=>mayaConfig({MAYA_SANDBOX_ENABLED:'true',MAYA_SANDBOX_PUBLIC_DEMO:'true',SUPABASE_SECRET_KEY:'x',APP_BASE_URL:origin}));
  assert.equal(config().demo,true);
  for(const url of ['https://evil.example','https://payments-web-sandbox.maya.ph.evil.example','http://payments-web-sandbox.maya.ph','https://x@payments-web-sandbox.maya.ph','https://payments-web.paymaya.com'])assert.throws(()=>sandboxRedirect(url));
});
test('checkout calls only sandbox, uses repriced amount, and sends no customer details',async()=>{
  let sent;const id=randomUUID();
  const client=createMayaClient(config(),async(url,options)=>{sent={url,options};return {ok:true,json:async()=>({checkoutId:id,redirectUrl:'https://payments-web-sandbox.maya.ph/test'})};});
  const payment={id:randomUUID(),order_id:randomUUID(),amount_cents:12345,customer:{email:'private@example.test'}};
  const result=await client.create(payment),body=JSON.parse(sent.options.body);
  assert.match(sent.url,/^https:\/\/pg-sandbox\.paymaya\.com\//);assert.equal(body.totalAmount.value,'123.45');
  assert.equal(body.requestReferenceNumber,payment.id);assert.equal(body.buyer.contact.email,'sandbox@example.com');
  assert.ok(!sent.options.body.includes('private@example.test'));assert.equal(result.checkout_id,id);
  assert.equal(sent.options.redirect,'error');assert.ok(sent.options.signal);
});
test('payment verification binds amount, currency, provider ID and unique reference, not redirects',()=>{
  const p={id:randomUUID(),checkout_id:randomUUID(),amount_cents:10000};
  const value={id:p.checkout_id,requestReferenceNumber:p.id,amount:'100.00',currency:'PHP',status:'PAYMENT_SUCCESS',isPaid:true};
  assert.equal(verifiedResult(value,p).status,'sandbox-paid');
  for(const change of [{id:randomUUID()},{requestReferenceNumber:randomUUID()},{amount:'1'},{amount:'100.001'},{currency:'USD'}])assert.throws(()=>verifiedResult({...value,...change},p),/mismatch/);
  assert.throws(()=>verifiedResult([value,value],p),/uncertain/);
  assert.throws(()=>verifiedResult(null,p),/mismatch/);
  assert.equal(verifiedResult({...value,isPaid:false},p).status,'review');
  for(const [status,expected] of [['PAYMENT_FAILED','failed'],['PAYMENT_CANCELLED','cancelled'],['PAYMENT_EXPIRED','expired'],['PENDING_TOKEN','pending'],['PENDING_PAYMENT','pending'],['FOR_AUTHENTICATION','pending'],['UNKNOWN','review']])assert.equal(verifiedResult({...value,status},p).status,expected);
});
test('simultaneous starts claim one session; verified success survives late failure',async()=>{
  const f=fixture(),service=createPaymentService(f.db,f.maya);
  await Promise.all([service.start(f.record),service.start(f.record)]);
  assert.equal(f.creates,1);assert.equal(f.rows.length,1);
  await service.verify(f.rows[0]);assert.equal(f.rows[0].status,'sandbox-paid');
  f.providerStatus='PAYMENT_FAILED';await service.verify(f.rows[0]);assert.equal(f.rows[0].status,'sandbox-paid');
  await service.start(f.record);assert.equal(f.creates,1);
});
test('uncertain creation is never repeated and recovers by reference',async()=>{
  const f=fixture();let calls=0;
  f.maya.create=async()=>{calls++;throw new Error('timeout')};
  const service=createPaymentService(f.db,f.maya);
  await assert.rejects(service.start(f.record),/could not be confirmed/);
  assert.equal((await service.start(f.record)).status,'creating');assert.equal(calls,1);
  await service.verify(f.rows[0]);assert.equal(f.rows[0].status,'sandbox-paid');
});
test('payment routes enforce owner authentication, closed order checks and trusted webhook source',async t=>{
  const f=fixture();
  const createClient=(_url,key,options)=>key==='secret'?f.db:{...f.db,auth:{getUser:async()=>({data:{user:options.global.headers.Authorization==='Bearer owner'?{id:f.record.user_id}:options.global.headers.Authorization==='Bearer other'?{id:randomUUID()}:null}})}};
  const app=express();app.set('trust proxy',1);app.use('/pay',mayaRouter({config:config(),url:'x',key:'pub',secret:'secret',createClient,maya:f.maya}));
  const base=await server(t,app),send=(path,token)=>fetch(base+'/pay'+path,{method:'POST',headers:token?{Authorization:'Bearer '+token}:{}});
  assert.equal((await send('/'+f.record.id+'/start')).status,401);
  assert.equal((await send('/'+f.record.id+'/start','invalid')).status,401);
  assert.equal((await send('/'+f.record.id+'/start','other')).status,404);
  assert.equal((await send('/webhook')).status,403);
  const result=await (await send('/'+f.record.id+'/start','owner')).json();
  assert.equal(result.payment.status,'pending');assert.ok(result.redirectUrl);assert.equal(result.payment.checkout_id,undefined);
  f.providerStatus='PAYMENT_FAILED';
  const callback=await fetch(base+'/pay/webhook',{method:'POST',headers:{'X-Forwarded-For':'13.229.160.234','Content-Type':'application/json'},body:JSON.stringify({requestReferenceNumber:f.rows[0].id,paymentStatus:'PAYMENT_SUCCESS',isPaid:true})});
  assert.equal(callback.status,200);assert.equal(f.rows[0].status,'failed');
  f.providerStatus='PAYMENT_SUCCESS';
  assert.equal((await (await send('/'+f.record.id+'/check','owner')).json()).payment.status,'sandbox-paid');
  f.record.status='cancelled';assert.equal((await send('/'+f.record.id+'/start','owner')).status,409);
});
test('staff queue fails closed when Maya status storage cannot be read',async t=>{
  const f=createOrderFixture([]),record={...order(),version:1,items:[],history:[],created_at:new Date().toISOString(),payment_status:'simulated'};f.orders.push(record);
  const base=await server(t,createApp(cfg,f.client));
  const response=await fetch(base+'/api/admin/orders',{headers:{Authorization:'Bearer admin'}});
  const item=(await response.json()).items[0];
  assert.equal(item.payment_status,'unverified');assert.ok(!item.allowed_statuses.includes('accepted'));assert.ok(item.allowed_statuses.includes('rejected'));
});
test('disabled sandbox exposes no secrets and cannot create Maya orders',async t=>{
  const f=createOrderFixture([]),app=createApp(cfg,f.client),base=await server(t,app);
  assert.deepEqual(await (await fetch(base+'/api/payments/maya/config')).json(),{enabled:false,publicDemo:false});
  assert.equal((await fetch(base+'/api/payments/maya/'+randomUUID()+'/start',{method:'POST'})).status,503);
  const body={request_id:randomUUID(),items:[{product_id:randomUUID(),label:'Hot',quantity:1}],total_cents:10000,payment_method:'maya-sandbox',customer:{name:'Test',email:'test@example.test',phone:'09123456789',address:'Test',barangay:'Test',city:'Test',province:'Test',postal:'1000',notes:''}};
  assert.equal((await fetch(base+'/api/orders',{method:'POST',headers:{Authorization:'Bearer member','Content-Type':'application/json'},body:JSON.stringify(body)})).status,503);
});
