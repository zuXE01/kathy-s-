const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {readMenu}=require('../server/menu-store');
const {createApp}=require('../server/app');
function load(file,context) {
  const source=fs.readFileSync(path.join(__dirname,'../public/js',file),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
  vm.runInNewContext(source,context);return context;
}
function dom() {
  const nodes=new Map();
  class Element {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.textContent='';this.value='';this.disabled=false;this.listeners={};this.classList={add(){},remove(){},contains(){return false;}};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    setAttribute(){} toggleAttribute(){} close(){this.open=false;} showModal(){this.open=true;} reset(){this.resetCalled=true;}
    focus(){document.activeElement=this;} closest(){return this;}
    addEventListener(name,callback){this.listeners[name]=callback;}
    querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tagName===tag?[child]:[]),...child.querySelectorAll(tag)]);}
    querySelector(tag){return this.querySelectorAll(tag)[0];}
  }
  const document={body:new Element(),createElement:tag=>new Element(tag),getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);}};
  return document;
}
test('kitchen cards and details render without customer information',()=>{
  const document=dom();
  const order={id:'sample-order',status:'accepted',version:1,items:[{name:'Coffee',quantity:1,cents:10000,label:'Hot'}],total_cents:10000,payment_method:'cod',created_at:new Date().toISOString(),history:[],allowed_statuses:['preparing']};
  const c=load('admin/orders.js',{document,formatPrice:String,showSkeleton:()=>()=>{},request:(_path,_options,callback)=>callback(null,{items:[order],total:1})});
  c.loadOrders();
  assert.equal(document.getElementById('orderRows').children.length,1);
  document.getElementById('orderRows').querySelector('button').listeners.click();
  assert.equal(document.getElementById('orderDialog').open,true);
  assert.equal(document.getElementById('orderNextStatus').children[0].value,'preparing');
});
test('checkout confirmation recovers a saved order without customer projection',()=>{
  const document=dom();let forgotten=0;
  let source=fs.readFileSync(path.join(__dirname,'../public/js/pages/checkout.js'),'utf8');
  // Execute the actual confirmation function without bootstrapping an authenticated page.
  source=source.slice(source.indexOf('function confirmation('),source.indexOf('async function load('));
  const c={el:id=>document.getElementById(id),formatPrice:String,forgetCart:()=>forgotten++,sessionStorage:{removeItem(){}},requestKey:'test'};
  vm.runInNewContext(source,c);
  c.confirmation({id:'saved',status:'pending',payment_method:'cod',total_cents:10000});
  assert.equal(forgotten,1);
  assert.equal(document.getElementById('confirmation').hidden,false);
  assert.match(document.getElementById('customerResult').textContent,/saved/);
});
test('cart increment preserves increment focus and session clear removes memory',()=>{
  const document=dom();let cart;
  const state={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/cart-state.js'),'utf8').replace(/export /g,''),state);
  const c=load('cart.js',{document,window:{addEventListener(){}},createCart:()=>cart=state.createCart(),readCart:()=>[],saveCart(){},forgetCart(){},formatPrice:String});
  c.initCart();c.addToCart({id:'one',name:'Coffee',section:'Coffee'},{label:'Hot',price:100});
  const root=document.getElementById('signedInView');
  root.querySelectorAll('button').find(button=>button.textContent==='+').listeners.click();
  assert.equal(document.activeElement.textContent,'+');
  assert.equal(cart.snapshot().count,2);
  c.clearCart();assert.equal(cart.snapshot().count,0);
});
test('catalog returns exactly 5000 items and explicitly rejects overflow',async()=>{
  for(const count of [5000,5001]){
    const client={from(){return {select(){return this;},order(){return this;},range(start,end){return Promise.resolve({data:Array.from({length:Math.max(0,Math.min(count-start,end-start+1))},()=>({id:'item'})),error:null});}};}};
    if(count===5000)assert.equal((await readMenu(client)).length,5000);
    else await assert.rejects(readMenu(client),/catalog limit/);
  }
});
test('proxy trust defaults to none and rejects unbounded trust',()=>{
  const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
  assert.equal(createApp(env).get('trust proxy'),0);
  assert.equal(createApp({...env,TRUST_PROXY_HOPS:'1'}).get('trust proxy'),1);
  for(const value of ['true','-1','99','1.5'])assert.throws(()=>createApp({...env,TRUST_PROXY_HOPS:value}),/TRUST_PROXY_HOPS/);
});
