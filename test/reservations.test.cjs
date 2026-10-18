const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={Intl,Date};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/reservation-offers.js'),'utf8').replace(/export /g,'')+'\nthis.offers=reservationOffers;this.extras=alaCarte;',context);
const valid={name:'Aaron',event:'Birthday',offer:'general-basic',date:'2026-10-20',time:'18:00',guests:'50',phone:'09602617352',notes:'Please confirm food choices.'};
test('reservation catalog preserves brochure tier prices, per-guest wedding rates and venue capacity',()=>{
  assert.equal(context.offers.length,10);
  assert.deepEqual(Array.from(context.offers.find(item=>item.id==='general-basic').rates,rate=>rate.price),[40000,54000,64500]);
  assert.deepEqual(Array.from(context.offers.find(item=>item.id==='debut-premium').rates,rate=>rate.price),[75900,84900,95400]);
  const wedding=context.offers.find(item=>item.id==='wedding');assert.equal(wedding.perGuest,true);assert.equal(wedding.rates[5].price,1035);
  assert.equal(context.offers.find(item=>item.id==='events-hall').capacity,70);
  assert.ok(!context.offers.find(item=>item.id==='debut-basic').inclusions.includes('Unlimited hot brewed coffee'));
  assert.ok(context.offers.find(item=>item.id==='debut-premium').food.Beef);
  assert.equal(context.offers.find(item=>item.id==='debut-premium').food['Beef or pork'],undefined);
  for(const offer of context.offers)assert.ok(fs.statSync(path.join(__dirname,'../public/assets/reservations',offer.source)).size>0);
});
test('inquiry is an encoded email draft to the restaurant, never a saved or confirmed booking',()=>{
  const draft=context.prepareReservationInquiry({...valid,name:'Ana & Jo',notes:'A & B? #test'},'2026-10-18');
  assert.match(draft.href,/^mailto:kathyshub08@gmail.com\?subject=/);assert.match(draft.href,/%26/);
  assert.match(draft.text,/Ana & Jo/);assert.match(draft.text,/A & B\? #test/);assert.match(draft.text,/does not confirm a booking/);
});
test('inquiry rejects stale/invalid dates, capacities, counts and times',()=>{
  for(const changes of [{date:'2026-10-17'},{date:'2026-02-30'},{time:'25:00'},{guests:0},{guests:101},{guests:50.5},{offer:'museum',guests:26},{offer:'unknown'},{name:'  '},{phone:'invalid'}])assert.throws(()=>context.prepareReservationInquiry({...valid,...changes},'2026-10-18'));
  assert.equal(context.manilaToday(new Date('2026-10-17T17:00:00Z')),'2026-10-18');
});
test('reservation route offers no-JS contact fallback, review-first draft and landing entry',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/reservations.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../public/js/pages/reservations.js'),'utf8');
  assert.match(html,/<noscript>/);assert.match(html,/Not sent yet/);assert.match(html,/id="inquiryText"[^>]*readonly/);
  assert.ok(!/localStorage|sessionStorage|fetch\(/.test(js));assert.ok(!/location\.(assign|href)/.test(js));
  assert.match(fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8'),/href="\/reservations.html"/);
});
