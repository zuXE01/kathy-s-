const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(){
  class Element{constructor(){this.children=[];this.attributes={};this.handlers={};}append(...values){this.children.push(...values);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,v){this.handlers[k]=v;}contains(value){return this===value||this.children.some(child=>child.contains?.(value));}querySelector(){return this.openDetails?{}:null;}focus(){document.activeElement=this;}}
  const nodes={},requests=[],timers=new Map(),events={},documentEvents={};let auth,clock=0;
  const el=id=>nodes[id]||(nodes[id]=new Element());
  const document={getElementById:el,createElement:()=>new Element(),addEventListener:(k,v)=>documentEvents[k]=v,hidden:false,activeElement:null};
  const context={document,window:{addEventListener:(k,v)=>events[k]=v,confirm:()=>true,location:{reload(){}}},setTimeout:(fn,delay)=>{const id=++clock;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),formatPrice:String,
    getAuthClient:async()=>({auth:{onAuthStateChange:fn=>auth=fn}}),
    orderRequest:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),
    showSkeleton:container=>{container.setAttribute('aria-busy','true');return()=>container.setAttribute('aria-busy','false');}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/pages/orders.js'),'utf8').replace(/^import .*;\r?\n/gm,''),context);
  await flush();
  return {nodes,requests,events,el,document,timers,documentEvents,auth:(event,id)=>auth(event,id?{user:{id}}:null),tick:(delay=0)=>{for(const [id,timer] of [...timers])if(timer.delay===delay){timers.delete(id);timer.fn();}}};
}
const data={items:[],total:0};
test('history clears on logout and ignores an in-flight response',async()=>{
  const f=await fixture();f.auth('SIGNED_IN','a');f.tick();
  assert.equal(f.el('orderHistory').attributes['aria-busy'],'true');
  f.auth('SIGNED_OUT');assert.equal(f.el('orderHistory').attributes['aria-busy'],'false');
  f.requests[0].resolve(data);await flush();
  assert.equal(f.el('orderHistory').children.length,0);assert.equal(f.el('ordersPrevious').disabled,true);
});
test('account switching ignores stale results and only clears busy for the active load',async()=>{
  const f=await fixture();f.auth('SIGNED_IN','a');f.tick();f.auth('SIGNED_IN','b');f.tick();
  f.requests[0].resolve(data);await flush();assert.equal(f.el('orderHistory').children.length,0);assert.equal(f.el('orderHistory').attributes['aria-busy'],'true');
  f.requests[1].resolve(data);await flush();assert.equal(f.el('orderHistory').children.length,2);assert.equal(f.el('orderHistory').attributes['aria-busy'],'false');
  assert.equal(f.el('orderHistory').children[1].textContent,'Browse the menu');assert.equal(f.el('orderHistory').children[1].href,'/#menu');
  f.auth('SIGNED_OUT');assert.equal(f.el('orderHistory').children.length,0);
});
test('failed requests reset busy and allow retry; navigation clears displayed history',async()=>{
  const f=await fixture();f.auth('SIGNED_IN','a');f.tick();f.requests[0].reject(new Error('Offline'));await flush();
  assert.equal(f.el('orderHistory').attributes['aria-busy'],'false');assert.equal(f.el('ordersRetry').hidden,false);
  f.el('ordersRetry').handlers.click();f.requests[1].resolve(data);await flush();assert.equal(f.el('orderHistory').children.length,2);
  f.events.pagehide();assert.equal(f.el('orderHistory').children.length,0);
});
test('pending and ready orders explain the next step without promising delivery',async()=>{
  const f=await fixture();f.auth('SIGNED_IN','a');f.tick();
  const order={id:'demo',created_at:'2026-10-09',items:[],history:[],payment_method:'cod',total_cents:100};
  f.requests[0].resolve({total:2,items:[{...order,status:'pending'},{...order,status:'ready'}]});await flush();
  const cards=f.el('orderHistory').children;
  assert.ok(cards[0].children.some(child=>/Awaiting restaurant acceptance/.test(child.textContent||'')));
  assert.ok(cards[1].children.some(child=>/No delivery is booked/.test(child.textContent||'')));
});
test('visible history refresh is serialized and retains cards and freshness on failure',async()=>{
  const f=await fixture();f.auth('SIGNED_IN','a');f.tick();f.requests[0].resolve(data);await flush();
  const card=f.el('orderHistory').children[0],stamp=f.el('ordersUpdated').textContent;
  f.tick(15000);f.el('ordersRefresh').handlers.click();assert.equal(f.requests.length,2);
  assert.equal(f.el('orderHistory').children[0],card);
  f.requests[1].reject(new Error('Offline'));await flush();
  assert.equal(f.el('orderHistory').children[0],card);assert.equal(f.el('ordersUpdated').textContent,stamp);
  assert.match(f.el('ordersStatus').textContent,/last loaded orders/);assert.equal(f.el('ordersRetry').hidden,false);
  f.el('ordersRetry').handlers.click();f.requests[2].resolve(data);await flush();
  assert.equal(f.el('orderHistory').children[0],card);assert.equal(f.el('ordersRefresh').disabled,false);
});
test('automatic updates pause for hidden, focused and expanded history; exit clears timers',async()=>{
  const f=await fixture();f.auth('SIGNED_IN','a');f.tick();f.requests[0].resolve(data);await flush();
  f.document.activeElement=f.el('orderHistory').children[1];f.tick(15000);assert.equal(f.requests.length,1);
  f.document.activeElement=null;f.el('orderHistory').openDetails=true;f.tick(15000);assert.equal(f.requests.length,1);
  f.el('orderHistory').openDetails=false;f.document.hidden=true;f.documentEvents.visibilitychange();assert.equal(f.timers.size,0);
  f.document.hidden=false;f.documentEvents.visibilitychange();assert.equal(f.requests.length,2);
  f.document.activeElement=f.el('orderHistory').children[1];f.requests[1].resolve({total:1,items:[]});await flush();
  assert.match(f.el('ordersStatus').textContent,/No saved orders/);assert.equal(f.el('orderHistory').children.length,2);
  f.events.pagehide();assert.equal(f.timers.size,0);assert.equal(f.el('ordersRefresh').disabled,true);
});
test('rate limiting pauses automatic reads and permission loss clears private cards',async()=>{
  const f=await fixture();f.auth('SIGNED_IN','a');f.tick();f.requests[0].resolve(data);await flush();
  f.tick(15000);f.requests[1].reject(Object.assign(new Error('Rate limit'),{status:429}));await flush();
  assert.equal(f.timers.size,0);assert.match(f.el('ordersStatus').textContent,/paused/);
  f.el('ordersRefresh').handlers.click();f.requests[2].reject(Object.assign(new Error('Forbidden'),{status:403}));await flush();
  assert.equal(f.el('orderHistory').children.length,0);assert.equal(f.timers.size,0);assert.equal(f.el('ordersRefresh').disabled,true);
});
test('malformed updates preserve the last successful view and failed pagination keeps its page',async()=>{
  const f=await fixture();f.auth('SIGNED_IN','a');f.tick();f.requests[0].resolve({total:20,items:[]});await flush();
  f.el('ordersNext').handlers.click();f.requests[1].resolve({total:20,items:[{}]});await flush();
  assert.equal(f.el('ordersPage').textContent,'Page 1');assert.equal(f.el('ordersNext').disabled,false);
  assert.equal(f.el('orderHistory').children.length,2);assert.equal(f.el('ordersRetry').hidden,false);
});
