const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={};vm.runInNewContext(fs.readFileSync('public/js/reservation-selection.js','utf8').replace(/export /g,''),context);
test('headline prices name the qualifying guest count or venue duration',()=>{
  const format=value=>'PHP '+value;
  assert.equal(context.offerPriceLabel({perGuest:true,rates:[{guests:50,price:1355},{guests:100,price:1035}]},format),'From PHP 1035 per guest at 100 guests');
  assert.equal(context.offerPriceLabel({family:'general',rates:[{guests:50,price:40000}]},format),'From PHP 40000 for 50 guests');
  assert.equal(context.offerPriceLabel({family:'venue',rates:[{label:'Per hour',price:1500}]},format),'PHP 1500 · Per hour');
});
test('selection references exact brochure tiers, never interpolates a quotation',()=>{
  const offer={rates:[{guests:50,price:40000},{guests:75,price:54000}]};
  assert.equal(context.selectionContext(offer,'75').rate.price,54000);
  assert.equal(context.selectionContext(offer,'60').rate,undefined);
  assert.equal(context.selectionContext(undefined,'').maximum,100);
});
test('venue changes expose capacity conflicts without changing guest count',()=>{
  assert.equal(context.selectionContext({capacity:25,rates:[]},26).overCapacity,true);
  assert.equal(context.selectionContext({capacity:70,rates:[]},26).overCapacity,false);
  assert.equal(context.selectionContext({capacity:25,rates:[]},25).overCapacity,false);
});
test('highlights omit repeated celebration benefits but retain full source data',()=>{
  const offer={family:'general',inclusions:['4-hour venue rental','Unlimited hot brewed coffee','One-panel backdrop','Choose ONE: host or photobooth']};
  assert.deepEqual(Array.from(context.offerHighlights(offer)),['One-panel backdrop','Choose ONE: host or photobooth']);
  assert.equal(offer.inclusions.length,4);
});
