const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function load(file,context={}) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js',file),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),context);
  return context;
}
function element(tag='div') {
  return {tag,children:[],events:{},attrs:{},classList:{toggle(){}},
    append(...nodes){this.children.push(...nodes)},setAttribute(key,value){this.attrs[key]=value},
    addEventListener(key,fn){this.events[key]=fn},focus(){this.focused=true}};
}
test('selected portion survives card reconstruction; stale labels safely use current first option',()=>{
  const c=load('menu-card.js',{Intl,document:{createElement:element}});
  const item={name:'Coffee ☕',variants:[{label:'Hot',price:100},{label:'Cold',price:135}]};
  let choice;
  const flatten=n=>[n,...n.children.flatMap(flatten)];
  const nodes=flatten(c.createMenuCard(item,{selectedLabel:'Cold',onOptionChange:value=>choice=value}));
  const select=nodes.find(n=>n.tag==='select');
  assert.equal(select.value,'1');
  assert.match(nodes.find(n=>n.className==='catalog-price').textContent,/135/);
  select.value='0';select.events.change();assert.equal(choice,'Hot');
  select.value='99';select.events.change();assert.equal(choice,'Hot');
  const fallback=flatten(c.createMenuCard(item,{selectedLabel:'Removed option'}));
  assert.equal(fallback.find(n=>n.tag==='select').value,'0');
});
test('checkout warning keeps details in memory, supports cancellation and clears after success',()=>{
  const {createCheckoutLeaveGuard}=load('checkout-leave-guard.js');
  const guard=createCheckoutLeaveGuard();let prevented=0,prompted=0;
  const link={target:'',hasAttribute:()=>false,getAttribute:()=>'/account.html?from=checkout'};
  const event={button:0,target:{closest:()=>link},preventDefault(){prevented++}};
  guard.beforeUnload(event);assert.equal(prevented,0);
  guard.changed();guard.followLink(event,()=>{prompted++;return false});
  assert.equal(prevented,1);assert.equal(prompted,1);
  guard.beforeUnload(event);assert.equal(prevented,2);
  guard.followLink({...event,ctrlKey:true},()=>assert.fail('New tab must not prompt'));
  guard.reset();guard.beforeUnload(event);assert.equal(prevented,2);
  guard.changed();guard.followLink(event,()=>true);
  guard.beforeUnload(event);assert.equal(prevented,2);
});
test('auth tabs support arrow keys, endpoints and focus transfer from registration link',()=>{
  const tabLoginBtn=element(),tabRegisterBtn=element(),toRegister=element();
  const c=load('tabs.js',{tabLoginBtn,tabRegisterBtn,loginView:element(),registerView:element(),loginMsg:{},registerMsg:{},document:{getElementById:()=>toRegister}});
  c.initTabs();let prevented=false;
  tabLoginBtn.events.keydown({key:'ArrowRight',preventDefault(){prevented=true}});
  assert.equal(prevented,true);assert.equal(tabRegisterBtn.tabIndex,0);assert.equal(tabLoginBtn.tabIndex,-1);assert.equal(tabRegisterBtn.focused,true);
  tabRegisterBtn.events.keydown({key:'Home',preventDefault(){}});
  assert.equal(tabLoginBtn.tabIndex,0);assert.equal(tabLoginBtn.focused,true);
  toRegister.events.click({preventDefault(){}});
  assert.equal(tabRegisterBtn.attrs['aria-selected'],'true');
});
test('promotional section is consumed before delayed authentication initializes',()=>{
  let section,accessChange;
  const nodes={productShowcase:{},memberCatalog:{},menu:{setAttribute(){}}};
  const removed=[];
  load('pages/landing.js',{URLSearchParams,location:{hash:'',search:''},sessionStorage:{getItem:()=>'Pasta',removeItem:key=>removed.push(key)},
    initMenu:value=>section=value,setMenuOrderAccess(){},window:{addEventListener:(_name,fn)=>accessChange=fn},
    document:{body:{dataset:{}},getElementById:id=>nodes[id],querySelector:()=>null,querySelectorAll:()=>[]}});
  assert.equal(section,'Pasta');assert.equal(removed.length,1);
  accessChange({detail:{signedIn:true}});assert.equal(section,'Pasta');
});
test('authentication cannot reveal an empty cart launcher or an empty announcement',()=>{
  let accessChange;
  const launcher={hidden:true,dataset:{empty:'true'},classList:{contains:()=>true}};
  const status={hidden:true,textContent:'',classList:{contains:()=>false}};
  const nodes={productShowcase:{},memberCatalog:{},menu:{setAttribute(){}}};
  load('pages/landing.js',{URLSearchParams,location:{hash:'',search:''},initMenu(){},setMenuOrderAccess(){},
    window:{addEventListener:(_name,fn)=>accessChange=fn},document:{body:{dataset:{}},getElementById:id=>nodes[id],querySelector:()=>null,
    querySelectorAll:selector=>selector==='.cart-launcher,.cart-status'?[launcher,status]:[]}});
  accessChange({detail:{signedIn:true}});assert.equal(launcher.hidden,true);assert.equal(status.hidden,true);
  launcher.dataset.empty='false';accessChange({detail:{signedIn:true}});assert.equal(launcher.hidden,false);
  accessChange({detail:{signedIn:false}});assert.equal(launcher.hidden,true);
});
