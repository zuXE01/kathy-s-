const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('reservation polish retains numeric readability and explicit interactive states',()=>{
  const css=fs.readFileSync('public/reservation-cards.css','utf8');
  assert.match(css,/font-variant-numeric:tabular-nums/);
  assert.match(css,/button:disabled/);assert.match(css,/input\[aria-invalid="true"\]/);
  assert.match(css,/details\[open\]>summary/);assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)/);
  assert.ok(!/transition:|animation:/.test(css));
});
