const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('reservation layout keeps narrow cards single column and preserves flexible detail flow',()=>{
  const css=fs.readFileSync('public/reservation-cards.css','utf8');
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/@media\(min-width:720px\)/);assert.match(css,/@media\(min-width:1120px\)/);
  assert.match(css,/margin-block:20px 24px/);assert.match(css,/#reservationForm\{align-content:start\}/);
  assert.ok(!/(?:[;{])order:|max-height:|overflow:hidden/.test(css));
});
