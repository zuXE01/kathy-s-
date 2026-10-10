const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function page(){
  const nodes={},requests=[],assigned=[];let auth;
  const document={getElementById:id=>nodes[id]||(nodes[id]={hidden:true,textContent:'',events:{},addEventListener(event,fn){this.events[event]=fn},removeAttribute(name){delete this[name]}})};
  const context={document,URL,URLSearchParams,location:{search:'?order=10000000-0000-4000-8000-000000000001&result=success',assign:url=>assigned.push(url)},window:{addEventListener(){}},
    signInPath:value=>'/signin.html?next='+encodeURIComponent(value),getAuthClient:async()=>({auth:{onAuthStateChange(fn){auth=fn}}}),
    orderRequest:(url,options)=>url==='/api/me'?Promise.resolve({id:'customer'}):new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/pages/payment.js'),'utf8').replace(/^import .*;\r?\n/gm,''),context);
  return {nodes,requests,assigned,auth:(...args)=>auth(...args)};
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
