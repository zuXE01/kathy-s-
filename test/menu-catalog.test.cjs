const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { items } = require('../server/menu-catalog.cjs');
const { importSql } = require('../scripts/menu-import.cjs');
const { validateItem } = require('../server/menu-validation');
const { readMenu } = require('../server/menu-store');
test('menu storage reads all batches without a fixed 500-item cutoff', async () => {
  const rows=Array.from({length:501},(_,id)=>({id})), ranges=[];
  const client={from(){return {select(){return this;},eq(){return this;},order(){return this;},async range(start,end){ranges.push([start,end]);return {data:rows.slice(start,end+1),error:null};}};}};
  assert.equal((await readMenu(client,{publicOnly:true})).length,501);
  assert.deepEqual(ranges,[[0,199],[200,399],[400,599]]);
});
function feature(name, context = {}) {
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/js',name),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),context);
  return context;
}
test('photo catalog has 120 unique products, 169 options and all 22 sections', () => {
  assert.equal(items.length,120);
  assert.equal(items.reduce((n,item)=>n+item.variants.length,0),169);
  assert.equal(new Set(items.map(item=>item.section)).size,22);
  assert.equal(new Set(items.map(item=>item.source_key)).size,items.length);
  assert.equal(new Set(items.map(item=>[item.category,item.section.toLowerCase(),item.name.toLowerCase()].join('|'))).size,items.length);
  items.forEach(item => assert.ok(validateItem(item),item.section+' / '+item.name));
  const find = (section,name) => items.find(item=>item.section===section && item.name===name);
  assert.deepEqual(find('Coffee','Cafe Americano').variants.map(option=>option.price),[100,125,135]);
  assert.equal(find('Coffee','Cappucino').variants.length,2);
  assert.equal(find('Coffee','Biscoff Latte').variants[0].label,'Hot · 12 oz');
  assert.deepEqual(find('Burnt Basque Cheesecake','Classic').variants.map(option=>option.price),[145,1088]);
  assert.deepEqual(find('Barkada Snacks','Fries').variants.map(option=>option.price),[138,265,375]);
  assert.equal(find('Other Drinks','Bottled Water').price,25);
  assert.match(importSql(),/on conflict do nothing/);
  assert.match(importSql(),/Fighter''s/);
});
test('variant validation rejects duplicates and derives the base price', () => {
  const item = items[0];
  assert.equal(validateItem({...item,price:999,variants:[{label:'Small',price:10},{label:'Large',price:20}]}).price,10);
  for (const variants of [[{label:'Small',price:10},{label:' small ',price:20}], [{label:'',price:10}], [{label:'Small',price:-1}], [{label:'Small',price:1.234}], [{label:'Small',price:'10'}],new Array(13).fill({label:'Size',price:1})]) assert.equal(validateItem({...item,variants}),null);
});
test('option editor parses explicit prices and rejects incomplete or duplicate rows', () => {
  const {parseOptions}=feature('menu-options.js');
  assert.equal(parseOptions('Slice | 145\nWhole | 1088')[1].price,1088);
  assert.equal(parseOptions(' ').length,0);
  for (const input of ['Small','Small |','Small | 1.234','Small | -1','Small | 2\nsmall | 3']) assert.throws(()=>parseOptions(input));
});
test('shared filters search sections, combine filters and sort prices without mutating data', () => {
  const {getOptions}=feature('menu-card.js');
  const {filterMenu}=feature('menu-filter.js',{getOptions});
  assert.equal(filterMenu(items,{section:'Pasta'}).length,5);
  assert.equal(filterMenu(items,{category:'bites',search:'matcha'}).length,0);
  assert.equal(filterMenu(items,{search:'cheesecake'}).length,7);
  assert.equal(filterMenu(items,{search:'missing product'}).length,0);
  const first=items[0];
  const sorted=filterMenu(items,{sort:'price-low'});
  assert.equal(sorted[0].price,15); assert.equal(items[0],first);
});
test('shared card changes price with its selected option and renders names as text', () => {
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.events={};this.attributes={};}
    append(...children){this.children.push(...children);}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(key,callback){this.events[key]=callback;}
  }
  const {createMenuCard}=feature('menu-card.js',{document:{createElement:tag=>new Element(tag)}});
  const card=createMenuCard({name:'<img src=x>',category:'coffee',section:'Coffee',variants:[{label:'Hot',price:100},{label:'Cold',price:135}]});
  const all=node=>[node,...node.children.flatMap(all)];
  const nodes=all(card), select=nodes.find(node=>node.tag==='select'), price=nodes.find(node=>node.className==='catalog-price');
  assert.equal(nodes.find(node=>node.tag==='h3').textContent,'<img src=x>');
  select.value='1'; select.events.change(); assert.match(price.textContent,/135/);
  assert.equal(nodes.filter(node=>node.tag==='option').length,2);
});
