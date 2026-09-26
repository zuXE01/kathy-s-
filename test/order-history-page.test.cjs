const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(){
  class Element{constructor(){this.children=[];this.attributes={};this.handlers={};}append(...values){this.children.push(...values);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,v){this.handlers[k]=v;}}
  const nodes={},requests=[],timers=[],events={};let auth;
  const el=id=>nodes[id]||(nodes[id]=new Element());
  const context={document:{getElementById:el,createElement:()=>new Element()},window:{addEventListener:(k,v)=>events[k]=v,confirm:()=>true,location:{reload(){}}},setTimeout:fn=>timers.push(fn),formatPrice:String,
    getAuthClient:async()=>({auth:{onAuthStateChange:fn=>auth=fn}}),
    orderRequest:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),
    showSkeleton:container=>{container.setAttribute('aria-busy','true');return()=>container.setAttribute('aria-busy','false');}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/pages/orders.js'),'utf8').replace(/^import .*;\r?\n/gm,''),context);
  await flush();
  return {nodes,requests,events,el,auth:(event,id)=>auth(event,id?{user:{id}}:null),tick:()=>{while(timers.length)timers.shift()();}};
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
  f.requests[1].resolve(data);await flush();assert.equal(f.el('orderHistory').children.length,1);assert.equal(f.el('orderHistory').attributes['aria-busy'],'false');
  f.auth('SIGNED_OUT');assert.equal(f.el('orderHistory').children.length,0);
});
test('failed requests reset busy and allow retry; navigation clears displayed history',async()=>{
  const f=await fixture();f.auth('SIGNED_IN','a');f.tick();f.requests[0].reject(new Error('Offline'));await flush();
  assert.equal(f.el('orderHistory').attributes['aria-busy'],'false');assert.equal(f.el('ordersRetry').hidden,false);
  f.el('ordersRetry').handlers.click();f.requests[1].resolve(data);await flush();assert.equal(f.el('orderHistory').children.length,1);
  f.events.pagehide();assert.equal(f.el('orderHistory').children.length,0);
});
