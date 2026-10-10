const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {randomUUID}=require('node:crypto');
const {mayaConfig,createMayaClient,sandboxRedirect,verifiedResult}=require('../server/maya-client.cjs');
const {mayaRouter,createPaymentService}=require('../server/maya-payments.cjs');
const {createApp}=require('../server/app');
const {createOrderFixture}=require('./order-fixture.cjs');
const {ordersRouter,mountAdminOrders}=require('../server/orders');
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
  const maya={create:async()=>{creates++;return {checkout_id:randomUUID(),redirect_url:'https://payments-web-sandbox.maya.ph/test'};},cancel:async()=>{providerStatus='PAYMENT_CANCELLED';return {};},retrieve:async row=>({id:row.checkout_id||randomUUID(),requestReferenceNumber:row.id,amount:'100.00',currency:'PHP',status:providerStatus,isPaid:providerStatus==='PAYMENT_SUCCESS'})};
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
test('cancellation before checkout claims the order once and prevents checkout creation',async()=>{
  const f=fixture(),service=createPaymentService(f.db,f.maya);
  await Promise.all([service.beforeClose(f.record,'cancelled'),service.beforeClose(f.record,'cancelled')]);
  assert.equal(f.rows.length,1);assert.equal(f.rows[0].status,'cancelled');
  await service.start(f.record);assert.equal(f.creates,0);
  assert.equal((await service.verify(f.rows[0])).status,'cancelled');
});
test('pending checkout is cancelled at Maya and retrieved before order closure',async()=>{
  const f=fixture();f.providerStatus='PENDING_TOKEN';const service=createPaymentService(f.db,f.maya);
  await service.start(f.record);let calls=0;
  const cancel=f.maya.cancel;f.maya.cancel=async row=>{calls++;return cancel(row)};
  await service.beforeClose(f.record,'cancelled');assert.equal(calls,1);assert.equal(f.rows[0].status,'cancelled');
  await service.beforeClose(f.record,'cancelled');assert.equal(calls,1);
});
test('a paid order cannot be cancelled but can be rejected into payment review',async()=>{
  const f=fixture(),service=createPaymentService(f.db,f.maya);await service.start(f.record);
  await assert.rejects(service.beforeClose(f.record,'cancelled'),e=>e.status===409&&e.code==='PAYMENT_REVIEW_REQUIRED');
  assert.equal(f.rows[0].status,'sandbox-paid');await service.beforeClose(f.record,'rejected');
});
test('provider timeout, ambiguous result and payment during cancellation leave the order open',async()=>{
  for(const outcome of ['timeout','still-pending','paid']) {
    const f=fixture();f.providerStatus='PENDING_TOKEN';const service=createPaymentService(f.db,f.maya);await service.start(f.record);
    if(outcome==='timeout')f.maya.retrieve=async()=>{throw new Error('timeout')};
    else f.maya.cancel=async()=>{if(outcome==='paid')f.providerStatus='PAYMENT_SUCCESS';throw new Error('uncertain')};
    await assert.rejects(service.beforeClose(f.record,'cancelled'),e=>[409,503].includes(e.status));
    assert.equal(f.record.status,'pending');
    if(outcome==='paid')assert.equal(f.rows[0].status,'sandbox-paid');
  }
});
test('first checkout racing with cancellation cannot create a second session',async()=>{
  const f=fixture();f.providerStatus='PENDING_TOKEN';const service=createPaymentService(f.db,f.maya);
  const results=await Promise.allSettled([service.start(f.record),service.beforeClose(f.record,'cancelled')]);
  assert.equal(f.rows.length,1);assert.ok(f.creates<=1);assert.equal(results[1].status,'fulfilled');
  assert.equal(f.rows[0].status,'cancelled');await service.start(f.record);assert.ok(f.creates<=1);
});
test('late checkout creation and stale pending results cannot erase confirmed cancellation',async()=>{
  const f=fixture();f.providerStatus='PENDING_TOKEN';let release,entered;
  const waiting=new Promise(resolve=>{entered=resolve}),create=f.maya.create;
  f.maya.create=async row=>{const result=await create(row);entered();await new Promise(resolve=>{release=resolve});return result};
  const service=createPaymentService(f.db,f.maya),starting=service.start(f.record);await waiting;
  await service.beforeClose(f.record,'cancelled');release();assert.equal((await starting).status,'cancelled');
  f.providerStatus='PENDING_TOKEN';assert.equal((await service.verify(f.rows[0])).status,'cancelled');
  f.providerStatus='PAYMENT_SUCCESS';assert.equal((await service.verify(f.rows[0])).status,'sandbox-paid');
});

test('Maya cancel uses secret authentication and a POST to the sandbox payment ID',async()=>{
  let sent;const client=createMayaClient(config(),async(url,options)=>{sent={url,options};return {ok:true,json:async()=>({})}}),id=randomUUID();
  await client.cancel({checkout_id:id});assert.equal(sent.url,'https://pg-sandbox.paymaya.com/payments/v1/payments/'+id+'/cancel');assert.equal(sent.options.method,'POST');
  assert.equal(Buffer.from(sent.options.headers.Authorization.slice(6),'base64').toString(),config().secretKey+':');
  assert.throws(()=>client.cancel({checkout_id:'bad'}),/identity/);
});
test('customer cancellation API keeps failed payment cancellations open and enforces ownership',async t=>{
  const f=createOrderFixture([]),record={...order(),user_id:'00000000-0000-4000-8000-000000000010',version:1,items:[],history:[]};f.orders.push(record);
  let closes=0,fail=true;
  const service={beforeClose:async()=>{closes++;if(fail)throw Object.assign(new Error('Payment requires review'),{status:409,code:'PAYMENT_REVIEW_REQUIRED'})}};
  const app=express();app.use('/orders',ordersRouter('x','key',f.client,{paymentService:service}));const base=await server(t,app);
  const send=token=>fetch(base+'/orders/'+record.id+'/cancel',{method:'POST',headers:{Authorization:'Bearer '+token}});
  assert.equal((await send('other')).status,409);assert.equal(closes,0);
  assert.equal((await send('member')).status,409);assert.equal(record.status,'pending');
  fail=false;assert.equal((await send('member')).status,200);assert.equal(record.status,'cancelled');
});
test('staff cancellation checks version before touching Maya and paid rejection exposes review flag',async t=>{
  const f=createOrderFixture([]),record={...order(),user_id:'00000000-0000-4000-8000-000000000010',version:1,items:[],history:[]};f.orders.push(record);
  const raw=f.client('x','k',{global:{headers:{Authorization:'Bearer admin'}}}),client={...raw,from:table=>table==='maya_sandbox_payments'?{select(){return this},in(){return Promise.resolve({data:[{order_id:record.id,status:'sandbox-paid'}]})}}:raw.from(table)};
  let closes=0;const app=express(),router=express.Router();router.use(express.json());router.use((req,_res,next)=>{req.adminClient=client;req.adminRole='owner';next()});
  mountAdminOrders(router,{beforeClose:async(_order,status)=>{closes++;assert.equal(status,'rejected')}});app.use('/admin',router);const base=await server(t,app);
  const send=version=>fetch(base+'/admin/orders/'+record.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'rejected',version,note:'Unavailable'})});
  assert.equal((await send(2)).status,409);assert.equal(closes,0);
  const result=await send(1);assert.equal(result.status,200);assert.equal((await result.json()).order.payment_review_required,true);assert.equal(closes,1);
});
