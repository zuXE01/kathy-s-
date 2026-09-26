const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const context={};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/js/account-model.js'),'utf8').replace(/export /g,''),context);
test('account validates optional address details and strips unknown fields',()=>{
  const value=context.contactDetails({name:' Demo ',phone:'09123456789',postal:'1000',user_id:'forged',role:'admin'});
  assert.equal(value.name,'Demo');assert.equal(value.address,'');assert.equal(value.role,undefined);assert.equal(value.user_id,undefined);
  for(const bad of [{name:''},{name:12},{name:'Demo',phone:'abc'},{name:'Demo',postal:'123'},{name:'Demo',notes:'x'.repeat(501)}])assert.throws(()=>context.contactDetails(bad));
});
test('account saves only allowed fields for the verified owner and propagates failures',async()=>{
  let written, authUser={id:'owner'}, databaseError=null;
  const client={auth:{getUser:async()=>({data:{user:authUser},error:null})},from:()=>({upsert:async value=>{written=value;return {error:databaseError};}})};
  const model=context;
  const scope={getAuthClient:async()=>client,contactDetails:model.contactDetails};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/js/account-client.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),scope);
  await scope.saveContact('owner',{name:'Demo',role:'admin',user_id:'other'});
  assert.equal(written.user_id,'owner');assert.equal(written.role,undefined);
  written=null;authUser={id:'other'};
  await assert.rejects(()=>scope.saveContact('owner',{name:'Demo'}),/session changed/);assert.equal(written,null);
  authUser={id:'owner'};databaseError={message:'failed'};
  await assert.rejects(()=>scope.saveContact('owner',{name:'Demo'}),/Unable to save/);
});
test('checkout prefill fills address without changing email or payment',()=>{
  const form={elements:Object.fromEntries(['name','phone','address','barangay','city','province','postal','notes','email','payment'].map(key=>[key,{value:key==='payment'?'cod':key==='email'?'login@example.test':''}]))};
  context.prefillContact(form,{name:'Demo',phone:'09123456789',address:'Sample St',barangay:'Sample',city:'Manila',province:'Metro Manila',postal:'1000',notes:'Gate',email:'other@example.test',payment:'paid'});
  assert.equal(form.elements.address.value,'Sample St');assert.equal(form.elements.postal.value,'1000');assert.equal(form.elements.email.value,'login@example.test');assert.equal(form.elements.payment.value,'cod');
  context.prefillContact(form,{name: {},address:null});assert.equal(form.elements.name.value,'Demo');assert.equal(form.elements.address.value,'Sample St');
});
