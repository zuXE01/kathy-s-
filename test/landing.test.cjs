const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../public/js/pages/landing.js'),'utf8').replace(/^import .*;\r?\n/gm,'');
test('public landing forwards existing email callback fragments to sign-in without losing them',()=>{
  for(const part of [{hash:'#access_token=sample&type=recovery',search:''},{hash:'#error=expired',search:''},{hash:'',search:'?code=sample'}]){
    let destination;
    vm.runInNewContext(script,{URLSearchParams,location:{...part,replace:value=>destination=value},initMenu:()=>assert.fail('Must not initialize menu for callbacks')});
    assert.equal(destination,'/signin.html'+part.search+part.hash);
  }
});
test('guests see product ads; only signed-in visitors initialize the full menu once',()=>{
  let initialized=0,change;
  const nodes={productShowcase:{},memberCatalog:{},menu:{setAttribute(){}}};
  vm.runInNewContext(script,{URLSearchParams,location:{hash:'#menu',search:''},initMenu:()=>initialized++,window:{addEventListener:(name,callback)=>change=callback},document:{body:{dataset:{}},getElementById:id=>nodes[id],querySelector:()=>null,querySelectorAll:()=>[]}});
  assert.equal(initialized,0);assert.equal(nodes.productShowcase.hidden,false);assert.equal(nodes.memberCatalog.hidden,true);
  change({detail:{signedIn:true}});change({detail:{signedIn:true}});
  assert.equal(initialized,1);assert.equal(nodes.productShowcase.hidden,true);assert.equal(nodes.memberCatalog.hidden,false);
  change({detail:{signedIn:false}});
  assert.equal(nodes.productShowcase.hidden,false);assert.equal(nodes.memberCatalog.hidden,true);
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const id of ['signedInView','catalogGrid','catalogFilters','catalogRetry','catalogMore','mobileMenuSection','catalogSearch'])assert.ok(ids.includes(id));
  assert.ok(fs.existsSync(path.join(__dirname,'../public/signin.html')));
});
