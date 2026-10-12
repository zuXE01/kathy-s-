const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function page(){
  const nodes={},requests=[],assigned=[],timers=new Map(),events={};let auth,nextTimer=0;
  const document={hidden:false,events:{},addEventListener(event,fn){this.events[event]=fn},getElementById:id=>nodes[id]||(nodes[id]={hidden:true,textContent:'',events:{},setAttribute(name,value){this[name]=value},focus(){document.activeElement=this},addEventListener(event,fn){this.events[event]=fn},removeAttribute(name){delete this[name]}})};
  const context={document,URL,URLSearchParams,setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer},clearTimeout:id=>timers.delete(id),location:{search:'?order=10000000-0000-4000-8000-000000000001&result=success',assign:url=>assigned.push(url)},window:{addEventListener(name,fn){events[name]=fn},confirm:()=>true},
    signInPath:value=>'/signin.html?next='+encodeURIComponent(value),getAuthClient:async()=>({auth:{onAuthStateChange(fn){auth=fn}}}),
    orderRequest:(url,options)=>url==='/api/me'?Promise.resolve({id:'customer'}):new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/pages/payment.js'),'utf8').replace(/^import .*;\r?\n/gm,''),context);
  return {nodes,requests,assigned,document,events,timers,runTimer(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();},auth:(...args)=>auth(...args)};
}
test('payment return query cannot claim success and duplicate starts stay serialized',async()=>{
  const f=page();await tick();assert.equal(f.requests.length,1);
  f.requests[0].resolve({payment:{status:'not-started'},orderStatus:'pending'});await tick();
  assert.match(f.nodes.paymentStatus.textContent,/No payment has been made/);assert.equal(f.nodes.paymentStart.hidden,false);
  f.nodes.paymentStart.events.click();f.nodes.paymentStart.events.click();assert.equal(f.requests.length,2);
  f.requests[1].resolve({payment:{status:'pending'},redirectUrl:'https://payments-web-sandbox.maya.ph/test'});await tick();
  assert.deepEqual(f.assigned,['https://payments-web-sandbox.maya.ph/test']);
});
test('payment failure can be retried and account changes discard in-flight responses',async()=>{
  const f=page();await tick();f.requests[0].reject(new Error('Offline'));await tick();
  assert.equal(f.nodes.paymentCheck.hidden,false);assert.match(f.nodes.paymentError.textContent,/Offline/);
  f.nodes.paymentCheck.events.click();assert.equal(f.requests.length,2);
  f.auth('SIGNED_OUT',null);f.requests[1].resolve({payment:{status:'sandbox-paid'}});await tick();
  assert.match(f.nodes.paymentStatus.textContent,/session changed/);assert.equal(f.nodes.paymentReference.textContent,'');assert.equal(f.nodes.paymentCheck.hidden,true);
});
test('closed orders and unapproved destinations never offer payment links',async()=>{
  const f=page();await tick();f.requests[0].resolve({payment:{status:'pending'},orderStatus:'cancelled',redirectUrl:'https://payments-web-sandbox.maya.ph/test'});await tick();
  assert.equal(f.nodes.paymentResume.hidden,true);assert.equal(f.nodes.paymentStart.hidden,true);
  f.nodes.paymentCheck.events.click();f.requests[1].resolve({payment:{status:'pending'},orderStatus:'pending',redirectUrl:'https://evil.example'});await tick();
  assert.equal(f.nodes.paymentResume.hidden,true);assert.equal(f.assigned.length,0);
});
test('payment sign-in return accepts only exact local UUID links',()=>{
  const context={URLSearchParams};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/routes.js'),'utf8').replace(/export /g,''),context);
  const valid='/payment.html?order=10000000-0000-4000-8000-000000000001';assert.equal(context.safeDestination(valid),valid);
  for(const value of ['https://evil.example'+valid,valid+'&next=https://evil.example','/payment.html?order=bad',valid+'#fragment'])assert.equal(context.safeDestination(value),'/#menu');
});
test('safe payment retries retain the order and send the current attempt exactly once',async()=>{
  const f=page();await tick();const attemptId='20000000-0000-4000-8000-000000000001';
  f.requests[0].resolve({payment:{status:'expired',attemptId,providerStatus:'PAYMENT_EXPIRED'},orderStatus:'pending'});await tick();assert.equal(f.nodes.paymentRetry.hidden,false);
  f.nodes.paymentRetry.events.click();f.nodes.paymentRetry.events.click();assert.equal(f.requests.length,2);assert.match(f.requests[1].url,/10000000-0000-4000-8000-000000000001\/retry$/);assert.equal(JSON.parse(f.requests[1].options.body).attemptId,attemptId);
  f.auth('SIGNED_OUT',null);f.requests[1].resolve({payment:{status:'pending'},redirectUrl:'https://payments-web-sandbox.maya.ph/test'});await tick();assert.equal(f.assigned.length,0);assert.equal(f.nodes.paymentRetry.hidden,true);
});
test('payment checks keep controls stable, preserve prior status on failure and restore focus on success',async()=>{
  const f=page();await tick();f.requests[0].resolve({payment:{status:'pending'},orderStatus:'pending',redirectUrl:'https://payments-web-sandbox.maya.ph/test'});await tick();
  f.nodes.paymentCheck.focus();f.nodes.paymentCheck.events.click();assert.equal(f.nodes.paymentCheck.hidden,false);assert.equal(f.nodes.paymentCheck.disabled,true);
  let prevented=false;f.nodes.paymentResume.events.click({preventDefault(){prevented=true}});assert.equal(prevented,true);
  f.requests[1].reject(Error('Offline'));await tick();assert.match(f.nodes.paymentStatus.textContent,/pending/);assert.equal(f.nodes.paymentResume.hidden,false);assert.equal(f.nodes.paymentCheck.disabled,false);
  f.nodes.paymentCheck.events.click();f.requests[2].resolve({payment:{status:'sandbox-paid'},orderStatus:'pending'});await tick();
  assert.equal(f.nodes.paymentTrack.hidden,false);assert.equal(f.nodes.paymentCheck.hidden,true);assert.equal(f.document.activeElement,f.nodes.paymentStatus);assert.equal(f.timers.size,0);
});
test('automatic verification is bounded, visibility-aware and stops on signout',async()=>{
  const f=page();await tick();const pending={payment:{status:'pending'},orderStatus:'pending'};f.requests[0].resolve(pending);await tick();
  assert.equal(f.timers.size,1);assert.equal(f.nodes.paymentRecovery.hidden,false);
  f.document.hidden=true;f.document.events.visibilitychange();assert.equal(f.timers.size,0);
  f.document.hidden=false;f.document.events.visibilitychange();
  for(let i=0;i<8;i++){f.runTimer();f.requests.at(-1).resolve(pending);await tick();}
  assert.equal(f.requests.length,9);assert.equal(f.timers.size,0);
  f.auth('SIGNED_OUT',null);assert.equal(f.nodes.paymentRecovery.hidden,true);assert.equal(f.nodes.paymentFreshness.textContent,'');
});
test('malformed destinations and rate limits retain safe state without retry storms',async()=>{
  const f=page();await tick();f.requests[0].resolve({payment:{status:'pending'},redirectUrl:'invalid URL',orderStatus:'pending'});await tick();
  assert.equal(f.nodes.paymentResume.hidden,true);assert.equal(f.nodes.paymentRecovery.hidden,false);assert.equal(f.assigned.length,0);
  f.runTimer();f.requests[1].reject(Object.assign(Error('limit'),{status:429}));await tick();assert.equal(f.timers.size,0);assert.match(f.nodes.paymentError.textContent,/Wait a moment/);
  f.nodes.paymentCheck.events.click();f.requests[2].reject(Object.assign(Error('expired'),{status:401}));await tick();assert.equal(f.nodes.paymentSignin.hidden,false);assert.equal(f.nodes.paymentCheck.hidden,true);
});
test('payment copy distinguishes a cancelled checkout from the saved restaurant order',async()=>{
  const f=page();await tick();f.requests[0].resolve({payment:{status:'cancelled',attemptId:'20000000-0000-4000-8000-000000000001',providerStatus:'PAYMENT_CANCELLED'},orderStatus:'pending'});await tick();
  assert.match(f.nodes.paymentStatus.textContent,/does not cancel your restaurant order/);assert.match(f.nodes.paymentStatus.textContent,/keeps this order/);
  f.nodes.paymentCheck.events.click();f.requests[1].resolve({payment:{status:'cancelled',providerStatus:'NOT_STARTED'},orderStatus:'cancelled'});await tick();
  assert.match(f.nodes.paymentStatus.textContent,/No Maya test checkout was opened/);assert.equal(f.nodes.paymentRetry.hidden,true);
});
