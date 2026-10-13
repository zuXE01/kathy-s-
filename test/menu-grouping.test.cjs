const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {items}=require('../server/menu-catalog.cjs');
const source=name=>fs.readFileSync(require('node:path').join(__dirname,'../public/js',name),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,'');
async function fixture(initial='all'){
  const nodes={};
  class Element{
    constructor(){this.children=[];this.dataset={};this.handlers={};this.value='';this.attributes={};this.classList={toggle(){}};}
    append(...children){this.children.push(...children);}replaceChildren(){this.children=[];}
    get options(){return this.children;}
    setAttribute(key,value){this.attributes[key]=value;}addEventListener(key,handler){this.handlers[key]=handler;}
    querySelectorAll(){return this.children.filter(child=>child.dataset.group);}querySelector(){return this.querySelectorAll()[0];}
    focus(){this.focused=true;}
  }
  const el=id=>nodes[id]??=new Element();
  const context={document:{getElementById:el,createElement:()=>new Element()},Intl,setTimeout:fn=>{fn();return 1;},clearTimeout(){},
    fetch:async()=>({ok:true,json:async()=>({items:items.map((item,id)=>({...item,id}))})}),
    initCart(){},addToCart(){},showSkeleton:()=>()=>{},createMenuCard:(item,options)=>({item,options})};
  vm.runInNewContext(source('menu-card.js').split('function createMenuCard')[0],context);
  vm.runInNewContext(source('menu-filter.js')+'\nthis.groups=menuGroups;',context);
  vm.runInNewContext(source('menu.js'),context);context.initMenu(initial,{canOrder:false});
  await new Promise(resolve=>setImmediate(resolve));
  return {context,el,choose:group=>el('catalogFilters').handlers.click({target:{closest:()=>el('catalogFilters').children.find(button=>button.dataset.group===group)}})};
}
test('four menu groups partition all catalog items and retain Bingsu as dessert',async()=>{
  const {context}=await fixture();
  assert.deepEqual(Array.from(context.groups,group=>group.label),['All','Food','Drinks','Desserts']);
  const counts=['bites','coffee','sweet'].map(category=>context.filterMenu(items,{category}).length);
  assert.equal(counts.reduce((a,b)=>a+b,0),120);
  assert.equal(context.sectionGroup(items,'Bingsu'),'sweet');
  assert.equal(context.sectionGroup(items,'Other Drinks'),'coffee');
  assert.equal(context.sectionGroup(items,'Unknown'),'all');
});
test('group changes scope sections and search without losing portion choices',async()=>{
  const f=await fixture('Coffee');assert.equal(f.el('catalogFilters').children.length,4);
  assert.equal(f.el('catalogSearchLabel').textContent,'Search drinks');
  assert.equal(f.el('catalogSearch').attributes['aria-label'],'Search drinks');
  assert.match(f.el('menuResult').textContent,/in Coffee/);
  assert.ok(f.el('mobileMenuSection').options.some(option=>option.value==='Other Drinks'));
  assert.ok(!f.el('mobileMenuSection').options.some(option=>option.value==='Pasta'));
  const coffee=f.el('catalogGrid').children[0];coffee.options.onOptionChange('Cold · 16 oz');
  f.choose('bites');assert.equal(f.el('mobileMenuSection').value,'all');
  assert.ok(f.el('mobileMenuSection').options.some(option=>option.value==='Pasta'));
  f.choose('coffee');
  assert.equal(f.el('catalogGrid').children.find(card=>card.item.id===coffee.item.id).options.selectedLabel,'Cold · 16 oz');
  assert.equal(f.el('catalogGrid').children[0].options.onAdd,undefined);
  f.el('catalogSearch').value='pasta';f.el('catalogSearch').handlers.input();
  assert.equal(f.el('catalogGrid').children.length,0);assert.equal(f.el('catalogClear').hidden,false);
  assert.equal(f.el('menuResult').textContent,'No matching items in drinks.');
  assert.match(f.el('catalogEmpty').textContent,/browse the full menu/);
  f.el('catalogClear').handlers.click();assert.equal(f.el('catalogSearch').value,'');
  assert.equal(f.el('mobileMenuSection').options.length,23);assert.equal(f.el('catalogSearch').focused,true);
  assert.equal(f.el('catalogSearchLabel').textContent,'Search the full menu');
  f.context.setMenuOrderAccess(true);assert.equal(typeof f.el('catalogGrid').children[0].options.onAdd,'function');
});
