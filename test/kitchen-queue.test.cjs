const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
  let timer;const requests=[],nodes={};
  class Element {
    constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.value='active';this.textContent='';}
    append(...values){this.children.push(...values)}replaceChildren(){this.children=[]}
    setAttribute(){}addEventListener(name,fn){this.events[name]=fn}
    contains(element){return this===element||this.children.some(child=>child.contains(element))}
    focus(){document.activeElement=this}close(){this.open=false}showModal(){this.open=true}
  }
  const document={hidden:false,createElement:tag=>new Element(tag),addEventListener(){},getElementById:id=>nodes[id]||(nodes[id]=new Element())};
  const context={document,window:{addEventListener(){}},Date,formatPrice:String,showSkeleton:()=>()=>{},setTimeout:fn=>{timer=fn;return 1},clearTimeout:()=>timer=null,
    request:(url,options,callback)=>requests.push({url,options,callback})};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/admin/orders.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),context);
  const order={id:'test',version:7,status:'accepted',allowed_statuses:['preparing'],created_at:new Date(Date.now()-60000).toISOString(),items:[{name:'Coffee',label:'Cold',quantity:2,cents:100}],history:[],total_cents:200};
  return {context,document,requests,order,el:document.getElementById,tick(){const fn=timer;timer=null;fn?.()}};
}
const flatten=node=>[node,...node.children.flatMap(flatten)];
test('kitchen card exposes preparation items and one version-checked action; duplicate taps are ignored',()=>{
  const f=fixture();f.context.loadOrders();f.requests[0].callback(null,{items:[f.order],total:1});
  const nodes=flatten(f.el('orderRows'));
  assert.ok(nodes.some(node=>node.textContent==='2 × Coffee · Cold'));
  const button=nodes.find(node=>node.textContent==='Start preparing');
  button.events.click();button.events.click();assert.equal(f.requests.length,2);
  assert.deepEqual(JSON.parse(f.requests[1].options.body),{status:'preparing',note:'',version:7});
  f.requests[1].callback(new Error('Order changed'));
  assert.equal(button.disabled,true);assert.match(f.el('ordersMessage').textContent,/Refresh orders/);
});
test('refresh pauses for focus, dialogs and hidden pages, and clear cancels old responses',()=>{
  const f=fixture();f.context.setOrdersVisible(true);f.context.loadOrders();f.requests[0].callback(null,{items:[f.order],total:1});
  f.document.activeElement=f.el('orderRows').children[0];f.tick();assert.equal(f.requests.length,1);
  f.document.activeElement=null;f.el('orderDialog').open=true;f.tick();assert.equal(f.requests.length,1);
  f.el('orderDialog').open=false;f.document.hidden=true;f.tick();assert.equal(f.requests.length,1);
  f.document.hidden=false;f.tick();assert.equal(f.requests.length,2);
  f.context.clearOrders();f.requests[1].callback(null,{items:[f.order],total:1});
  assert.equal(f.el('orderRows').children.length,0);f.tick();assert.equal(f.requests.length,2);
});
test('refresh keeps existing cards on failure and never overlaps reads',()=>{
  const f=fixture();f.context.setOrdersVisible(true);f.context.loadOrders();f.requests[0].callback(null,{items:[f.order],total:1});
  const card=f.el('orderRows').children[0];f.tick();f.context.loadOrders(1,true);assert.equal(f.requests.length,2);
  f.requests[1].callback(new Error('Offline'));assert.equal(f.el('orderRows').children[0],card);
  assert.match(f.el('ordersMessage').textContent,/Last successful update/);
});
test('a dialog opened during refresh survives and unapproved quick actions are absent',()=>{
  const f=fixture();f.context.setOrdersVisible(true);f.context.loadOrders();
  f.requests[0].callback(null,{items:[{...f.order,allowed_statuses:[]}],total:1});
  const original=f.el('orderRows').children[0];
  assert.equal(flatten(original).filter(node=>node.tag==='button').length,1);
  f.tick();f.el('orderDialog').open=true;
  f.requests[1].callback(null,{items:[],total:0});
  assert.equal(f.el('orderDialog').open,true);assert.equal(f.el('orderRows').children[0],original);
});
test('active queue filters terminal orders and sorts before pagination, with stable tie ordering',async t=>{
  const {createApp}=require('../server/app'),{createOrderFixture,memberId}=require('./order-fixture.cjs');
  const f=createOrderFixture([]);
  for(let i=24;i>=0;i--)f.orders.push({id:String(i).padStart(3,'0'),user_id:memberId,status:'accepted',created_at:new Date(2026,0,1,0,i).toISOString(),items:[],history:[]});
  f.orders.push({id:'done',user_id:memberId,status:'completed',created_at:'2020-01-01',items:[],history:[]});
  const app=createApp({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},f.client);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const get=async query=>(await fetch(`http://127.0.0.1:${server.address().port}/api/admin/orders?${query}`,{headers:{Authorization:'Bearer admin'}})).json();
  const first=await get('status=active'),second=await get('status=active&page=2');
  assert.equal(first.total,25);assert.equal(first.items[0].id,'000');assert.equal(first.items[19].id,'019');assert.equal(second.items[0].id,'020');
  const history=await get('status=completed');assert.equal(history.items[0].id,'done');
});
