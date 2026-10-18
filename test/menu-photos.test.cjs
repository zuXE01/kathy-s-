const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {items}=require('../server/menu-catalog.cjs');
function fixture(){
  const context={Intl,document:{createElement:tag=>({tag,children:[],handlers:{},attributes:{},append(...nodes){this.children.push(...nodes);},setAttribute(key,value){this.attributes[key]=value;},addEventListener(key,handler){this.handlers[key]=handler;}})}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/menu-card.js'),'utf8').replace(/export /g,''),context);return context;
}
test('13 optimized food photos match 10 products by section and name without duplicate products',()=>{
  const {getMenuPhotos}=fixture();const matched=items.filter(item=>getMenuPhotos(item).length);
  assert.equal(matched.length,10);assert.equal(matched.reduce((total,item)=>total+getMenuPhotos(item).length,0),13);
  const names=matched.flatMap(getMenuPhotos);assert.equal(new Set(names).size,13);
  for(const name of names)for(const width of [400,800]){
    const bytes=fs.readFileSync(path.join(__dirname,'../public/assets/menu',name+'-'+width+'.webp'));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes.length<200000);
  }
  assert.equal(getMenuPhotos({section:'Premium Waffles',name:'Cookies and Cream'}).length,0);
  assert.equal(getMenuPhotos({section:'Coffee Frappe',name:'Biscoff'}).length,0);
  assert.equal(getMenuPhotos({section:' desserts ',name:' BISCOFF   COOKIE '}).length,2);
});
test('menu cards use local responsive lazy photos, retain controls and hide broken images',()=>{
  const {createMenuCard}=fixture();const item=items.find(item=>item.name==='Biscoff Cookie');
  const card=createMenuCard(item),all=node=>[node,...node.children.flatMap(all)],nodes=all(card),images=nodes.filter(node=>node.tag==='img');
  assert.equal(images.length,2);assert.equal(images[0].loading,'lazy');assert.equal(images[0].decoding,'async');
  assert.match(images[0].src,/^\/assets\/menu\//);assert.match(images[0].srcset,/400w.*800w/);assert.match(images[0].alt,/Biscoff Cookie/);
  assert.equal(images[0].attributes['data-photo'],'biscoff-cookie-1');
  assert.ok(nodes.some(node=>node.tag==='summary'&&node.textContent==='More photos'));
  assert.ok(nodes.some(node=>node.className==='catalog-price'));
  images[0].handlers.error();assert.equal(images[0].hidden,true);
});
test('all card photos fill a consistent frame without distortion and drinks have focal overrides',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../public/menu-cards.css'),'utf8');
  assert.match(css,/\.catalog-photo\{[^}]*aspect-ratio:4\/3;object-fit:cover/);
  for(const name of ['ube-cream-cheese','red-velvet-cream-cheese','kiwi-soda','passion-fruit-soda'])assert.ok(css.includes('[data-photo="'+name+'"]'));
});
