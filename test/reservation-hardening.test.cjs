const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/js/pages/reservations.js','utf8');
test('invalidating a draft removes both private text and stale email destination',()=>{
  const elements={inquiryDraft:{hidden:false},inquiryText:{value:'old private draft'},inquiryEmail:{removeAttribute(name){this.removed=name;}},draftStatus:{textContent:'Copied'},inquiryError:{textContent:'Error'}};
  const context={el:id=>elements[id]};
  const fn=source.match(/function invalidateDraft\(\)\{[\s\S]*?\n\}/)[0];
  vm.runInNewContext('let draftVersion=0;'+fn+';invalidateDraft();this.version=draftVersion;',context);
  assert.equal(elements.inquiryDraft.hidden,true);assert.equal(elements.inquiryText.value,'');assert.equal(elements.inquiryEmail.removed,'href');assert.equal(context.version,1);
});
test('clipboard guards changed drafts and page lifecycle warns without persisting personal data',()=>{
  assert.match(source,/version!==draftVersion/);assert.match(source,/finally\{button.disabled=false/);
  assert.match(source,/beforeunload[\s\S]*?if\(!dirty\)return/);
  assert.match(source,/pagehide[\s\S]*?dirty=false[\s\S]*?invalidateDraft\(\)/);
  assert.match(source,/pageshow[\s\S]*?manilaToday/);
  assert.ok(!/localStorage|sessionStorage/.test(source));
});
