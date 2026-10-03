const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={};
vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/checkout-recovery.js'),'utf8').replace(/export /g,''),context);
test('checkout recovers saved orders before any price refresh, including legacy conflicts',async()=>{
  for(const code of ['CHECKOUT_ALREADY_SAVED','ORDER_CHANGED',undefined]){
    const order={id:'saved',total_cents:12300};let calls=0;
    const result=await context.recoverCheckoutConflict({code},'same-request',async path=>{
      calls++;assert.equal(path,'/api/orders/request/same-request');return {order};
    });
    assert.equal(calls,1);assert.equal(result.kind,'saved');assert.equal(result.order,order);
  }
});
test('checkout reprices only when no saved order exists and preserves uncertain conflicts',async()=>{
  const missing=async()=>({order:null});
  assert.equal((await context.recoverCheckoutConflict({code:'MENU_CHANGED'},'same-request',missing)).kind,'menu');
  await assert.rejects(context.recoverCheckoutConflict({code:'CHECKOUT_ALREADY_SAVED'},'same-request',missing),/do not start a new order/);
  await assert.rejects(context.recoverCheckoutConflict({},'same-request',async()=>{throw new Error('Offline');}),/Offline/);
});

test('browser order adapter preserves machine-readable conflict codes',async()=>{
  const scope={getAuthClient:async()=>({auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}}),fetch:async()=>({ok:false,status:409,json:async()=>({error:'Already saved',code:'CHECKOUT_ALREADY_SAVED'})})};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/order-api.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/export /g,''),scope);
  await assert.rejects(scope.orderRequest('/api/orders'),error=>error.status===409&&error.code==='CHECKOUT_ALREADY_SAVED');
});
