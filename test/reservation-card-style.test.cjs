const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
function luminance(hex){const values=hex.match(/\w\w/g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);}
test('tarot-inspired style is scoped to offers with accessible contrast and flexible content',()=>{
  const css=read('reservation-cards.css');assert.match(read('reservations.html'),/href="\/reservation-cards.css"/);
  assert.match(css,/#offerList \.offer/);assert.match(css,/pointer-events:none/);assert.match(css,/forced-colors:active/);
  assert.ok(!/max-height:|overflow:hidden|animation:/.test(css));
  for(const text of ['f3ead5','d4c8ad','ead29b'])assert.ok(contrast(text,'151c2c')>=4.5);
  assert.ok(contrast('ead29b','151c2c')>=4.5);
});

test('each offer has a stable unique jewel palette with readable gradient endpoints',()=>{
  const css=read('reservation-cards.css');
  const themes=[...css.matchAll(/data-offer="([^"]+)"\]\{--card-paper:#([0-9a-f]{6});--card-crown:#([0-9a-f]{6});--card-foil:#([0-9a-f]{6});--card-rule:#([0-9a-f]{6})\}/g)];
  assert.equal(themes.length,10);assert.equal(new Set(themes.map(theme=>theme[2])).size,10);
  for(const theme of themes)for(const surface of [theme[2],theme[3]])for(const foreground of ['f3ead5','d4c8ad','ead29b'])assert.ok(contrast(foreground,surface)>=4.5,theme[1]+' contrast');
  assert.match(read('js/pages/reservations.js'),/article.dataset.offer=offer.id/);
});
