const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const scope={URL,Map,Set};
vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/maya-handoff.js'),'utf8').replace(/export /g,''),scope);
const order={id:'10000000-0000-4000-8000-000000000001',status:'pending'};
const recovery='/payment.html?order='+order.id;
test('fresh Maya order opens one approved checkout without an intermediate tap',async()=>{
  const paths=[],destinations=[];let release;
  const handoff=scope.createMayaHandoff(path=>{paths.push(path);return new Promise(resolve=>release=resolve)},url=>destinations.push(url),()=>true);
  const first=handoff(order,{start:true}),second=handoff(order,{start:true});assert.equal(first,second);assert.equal(paths.length,1);
  release({payment:{status:'pending'},redirectUrl:'https://payments-web-sandbox.maya.ph/test'});await first;
  assert.deepEqual(destinations,['https://payments-web-sandbox.maya.ph/test']);assert.match(paths[0],/\/start$/);
});
test('recovered or closed orders use the confirmation page without starting payment',async()=>{
  for(const [value,options] of [[order,{}],[{...order,status:'cancelled'},{start:true}]]){
    let calls=0,destination;
    await scope.createMayaHandoff(async()=>{calls++},url=>destination=url,()=>true)(value,options);
    assert.equal(calls,0);assert.equal(destination,recovery);
  }
});
test('uncertain starts fall back once and never retry the provider request',async()=>{
  let calls=0;const destinations=[];
  const handoff=scope.createMayaHandoff(async()=>{calls++;throw Error('timeout')},url=>destinations.push(url),()=>true);
  await handoff(order,{start:true});await handoff(order,{start:true});
  assert.equal(calls,1);assert.deepEqual(destinations,[recovery]);
});
test('paid, missing, malformed and unapproved redirects cannot open a new payment',async()=>{
  for(const result of [{payment:{status:'sandbox-paid'},redirectUrl:'https://payments-web-sandbox.maya.ph/test'},null,{payment:{status:'pending'}},...['bad','https://evil.example','https://payments-web-sandbox.maya.ph.evil.example','http://payments-web-sandbox.maya.ph/test','https://user:pass@payments-web-sandbox.maya.ph/test','https://payments-web-sandbox.maya.ph:8443/test'].map(redirectUrl=>({payment:{status:'pending'},redirectUrl}))]){
    let destination;await scope.createMayaHandoff(async()=>result,url=>destination=url,()=>true)(order,{start:true});assert.equal(destination,recovery);
  }
});
test('account changes prevent late redirects and inactive starts',async()=>{
  let active=true,release,calls=0;const destinations=[];
  const handoff=scope.createMayaHandoff(()=>{calls++;return new Promise(resolve=>release=resolve)},url=>destinations.push(url),()=>active);
  const task=handoff(order,{start:true});active=false;release({payment:{status:'pending'},redirectUrl:'https://payments-web-sandbox.maya.ph/test'});await task;
  await handoff({...order,id:'10000000-0000-4000-8000-000000000002'},{start:true});assert.equal(calls,1);assert.equal(destinations.length,0);
  assert.throws(()=>handoff({id:'invalid'},{start:true}),/invalid/);
});
