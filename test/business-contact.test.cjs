const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('public contact section includes supplied business details and functional contact links',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  assert.match(html,/id="contact"/);assert.match(html,/mailto:kathyshub08@gmail.com/);
  assert.match(html,/tel:\+639602617352/);assert.match(html,/0960-2617-352/);
  assert.match(html,/8165 Dr\. A\. Santos Ave\., Parañaque City/);
  assert.match(html,/Events place, grazing tables and cafeteria/);
  assert.match(html,/event inquiries within Metro Manila and nearby provinces/);
});
test('payment help leads to restaurant contact without requesting payment secrets',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/payment.html'),'utf8');
  assert.match(html,/href="\/#contact"/);assert.match(html,/provide your order reference/);
  assert.match(html,/Never share passwords, payment credentials or one-time codes/);
});
