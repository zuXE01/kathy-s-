const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../public/js/cart-state.js'),'utf8').replace(/export /g,''),context);
test('cart combines identical sizes, separates variants and totals in cents',()=>{
  const cart=context.createCart(), item={id:'coffee',name:'Coffee',section:'Coffee'};
  cart.add(item,{label:'Hot',price:100.25});
  cart.add(item,{label:'Hot',price:100.25});
  cart.add(item,{label:'Cold',price:135});
  assert.equal(cart.snapshot().items.length,2);
  assert.equal(cart.snapshot().count,3);
  assert.equal(cart.snapshot().total,33550);
  const id=cart.snapshot().items[0].id;
  cart.change(id,-1); assert.equal(cart.snapshot().total,23525);
  cart.change(id,-1); assert.equal(cart.snapshot().items.length,1);
  cart.remove(cart.snapshot().items[0].id); assert.equal(cart.snapshot().count,0);
});
test('cart bounds quantities, rejects invalid prices and clears private drafts',()=>{
  const cart=context.createCart(), item={id:'a',name:'A'};
  assert.equal(cart.add(item,{label:'Bad',price:NaN}),false);
  assert.equal(cart.add(item,{label:'Bad',price:-1}),false);
  for(let i=0;i<110;i++)cart.add(item,{label:'Regular',price:1});
  assert.equal(cart.snapshot().count,99);
  const snapshot=cart.snapshot(); snapshot.items[0].quantity=500;
  assert.equal(cart.snapshot().count,99);
  cart.clear(); assert.equal(cart.snapshot().total,0);
});
