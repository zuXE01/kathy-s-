const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {items}=require('../server/menu-catalog.cjs');
function fixture(){
  const context={Intl,document:{createElement:tag=>({tag,children:[],handlers:{},attributes:{},append(...nodes){this.children.push(...nodes);},setAttribute(key,value){this.attributes[key]=value;},addEventListener(key,handler){this.handlers[key]=handler;}})}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/menu-card.js'),'utf8').replace(/export /g,'')+';globalThis.originalPhotos=menuPhotos;globalThis.supplementalPhotos=supplementalMenuPhotos;',context);return context;
}
test('13 optimized food photos match 10 products by section and name without duplicate products',()=>{
  const {getMenuPhotos,originalPhotos}=fixture();const matched=items.filter(item=>originalPhotos[(item.section+'|'+item.name).toLowerCase()]);
  assert.equal(matched.length,10);assert.equal(matched.reduce((total,item)=>total+getMenuPhotos(item).length,0),13);
  const names=matched.flatMap(getMenuPhotos);assert.equal(new Set(names).size,13);
  for(const name of names)for(const width of [400,800]){
    const bytes=fs.readFileSync(path.join(__dirname,'../public/assets/menu',name+'-'+width+'.webp'));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes.length<200000);
  }
  assert.ok(!getMenuPhotos({section:'Premium Waffles',name:'Cookies and Cream'}).includes('cookies-and-cream-cookie-1'));
  assert.ok(!getMenuPhotos({section:'Coffee Frappe',name:'Biscoff'}).includes('biscoff-cookie-1'));
  assert.equal(getMenuPhotos({section:' desserts ',name:' BISCOFF   COOKIE '}).length,2);
});

test('every published menu item has local photo assets and references cannot replace originals',()=>{
  const {getMenuPhotos,originalPhotos,createMenuCard}=fixture();
  const credits=fs.readFileSync(path.join(__dirname,'../public/menu-photo-credits.html'),'utf8');
  for(const item of items){
    const photos=getMenuPhotos(item);assert.ok(photos.length,item.section+' / '+item.name);
    const original=originalPhotos[(item.section+'|'+item.name).toLowerCase()];
    if(original)assert.deepEqual(photos,original);
    for(const name of photos)for(const width of [400,800]){
      const bytes=fs.readFileSync(path.join(__dirname,'../public/assets/menu',name+'-'+width+'.webp'));
      assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(bytes.length<200000);
    }
    const card=createMenuCard(item),notice=card.children.find(node=>node.className==='catalog-photo-credit');
    if(!original){assert.match(notice.textContent,/Reference photo/);assert.ok(credits.includes('id="'+photos[0]+'"'));}
    else assert.equal(notice,undefined);
  }
  assert.equal(getMenuPhotos({section:'Unknown',name:'New product'}).length,0);
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
