const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/checkout-model.js'),'utf8').replace(/export /g,''),context);
const catalog=[{id:'a',name:'Coffee',price:100,variants:[{label:'Cold',price:135}],available:true}];
const saved=[{id:JSON.stringify(['a','Cold']),quantity:2,cents:1,name:'Forged name'}];
test('checkout resolves current prices and names, rejecting missing options and invalid quantities',()=>{
  const result=context.resolveCheckout(saved,catalog);
  assert.equal(result.total,27000); assert.equal(result.lines[0].name,'Coffee');
  assert.throws(()=>context.resolveCheckout(saved,[]));
  assert.throws(()=>context.resolveCheckout(saved,[{...catalog[0],available:false}]));
  assert.throws(()=>context.resolveCheckout([...saved,...saved],catalog));
  for(const quantity of [0,100,1.5,-1])assert.throws(()=>context.resolveCheckout([{...saved[0],quantity}],catalog));
});
test('checkout validates customer address and payment choice',()=>{
  const details={name:'Demo Customer',email:'demo@example.test',phone:'09123456789',address:'123 Sample St',barangay:'Sample',city:'Manila',province:'Metro Manila',postal:'1000',notes:'',payment:'cod'};
  const form=value=>new Map(Object.entries({...details,...value}));
  assert.equal(context.customerDetails(form({})).payment,'cod');
  assert.equal(context.customerDetails(form({payment:'demo-online'})).payment,'demo-online');
  for(const value of [{name:' '},{email:'bad'},{phone:'abc'},{postal:'12'},{payment:'paid'},{address:''}])assert.throws(()=>context.customerDetails(form(value)));
});
