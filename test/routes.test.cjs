const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const scope={URLSearchParams};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/routes.js'),'utf8').replace(/export /g,''),scope);
test('return routing preserves approved destinations and rejects external or unknown URLs',()=>{
  for(const target of ['/checkout.html','/account.html','/account.html?from=checkout','/orders.html','/admin.html','/#menu']) {
    assert.equal(scope.returnDestination('?next='+encodeURIComponent(target)),target);
    assert.equal(scope.signInPath(target),'/signin.html?next='+encodeURIComponent(target));
  }
  for(const target of ['https://evil.test','//evil.test','/\\evil.test','javascript:alert(1)','/signin.html','/unknown','/checkout.html?next=https://evil.test'])assert.equal(scope.safeDestination(target),'/#menu');
});
test('sign-in is auth-only and checkout/account have a direct round trip',()=>{
  const read=f=>fs.readFileSync(path.join(__dirname,'../public',f),'utf8');
  assert.ok(!read('signin.html').includes('id="catalogGrid"'));
  assert.ok(!read('app.js').includes('initMenu'));
  assert.ok(read('checkout.html').includes('/account.html?from=checkout'));
  assert.ok(read('account.html').includes('id="returnCheckout"'));
  for(const f of ['index.html','account.html','checkout.html'])assert.ok(read(f).includes('customer-navigation.js'));
});
test('customer navigation follows verified session state and preserves checkout return context',async()=>{
  const nodes=Object.fromEntries(['data-signin','data-signout','data-admin','data-auth-prompt'].map(key=>[key,{hidden:false,addEventListener(){}}]));
  let callback,user=null;
  const client={auth:{onAuthStateChange(fn){callback=fn;},getUser:async()=>({data:{user},error:null})}};
  const source=fs.readFileSync(path.join(__dirname,'../public/js/customer-navigation.js'),'utf8').replace(/^import .*;\r?\n/gm,'');
  vm.runInNewContext(source,{URLSearchParams,setTimeout,getAuthClient:async()=>client,signInPath:scope.signInPath,location:{pathname:'/account.html',search:'?from=checkout',hash:''},document:{querySelectorAll:selector=>[nodes[selector.slice(1,-1)]]}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes['data-signin'].href,'/signin.html?next=%2Faccount.html%3Ffrom%3Dcheckout');
  assert.equal(nodes['data-auth-prompt'].hidden,false);
  user={id:'member',app_metadata:{}};callback('SIGNED_IN',{user});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(nodes['data-signin'].hidden,true);assert.equal(nodes['data-auth-prompt'].hidden,true);assert.equal(nodes['data-admin'].hidden,true);
  user={id:'admin',app_metadata:{hub_role:'admin'}};callback('SIGNED_IN',{user});
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(nodes['data-admin'].hidden,false);
  callback('SIGNED_OUT',null);assert.equal(nodes['data-signin'].hidden,false);assert.equal(nodes['data-signout'].hidden,true);
});
