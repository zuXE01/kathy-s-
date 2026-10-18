const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('guest prices have one complete selector while multi-duration venues retain comparison',()=>{
  const source=fs.readFileSync('public/js/pages/reservations.js','utf8');
  assert.match(source,/offer.family==='venue'&&offer.rates.length>1/);
  assert.match(source,/for\(const rate of offer.rates\)\{const option=node\('option',rate.guests/);
  for(const label of ['Everything included','Food choices','Additional guest rates','Package add-ons and extra charges'])assert.ok(source.includes(label));
  assert.match(source,/source.href='\/assets\/reservations\/\x27\+offer.source/);
});
