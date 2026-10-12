const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 const nodes={},requests=[];
 class Node{constructor(){this.events={};this.children=[];this.value='attention';}addEventListener(event,fn){this.events[event]=fn;}setAttribute(){}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}}
 const document={getElementById:id=>nodes[id]||(nodes[id]=new Node()),createElement:()=>new Node()};
 const context={document,Intl,Date,request:(url,options,callback)=>requests.push({url,options,callback})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/js/admin/payments.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ',''),context);
 context.initPayments();return {nodes,requests,...context};
}
test('failed investigation pagination retains page and retries the missing page instead of skipping it',()=>{
 const f=fixture();f.loadPayments();assert.match(f.requests[0].url,/page=1&filter=attention/);
 f.requests[0].callback(null,{items:[],total:60});f.nodes.paymentsNext.events.click();assert.match(f.requests[1].url,/page=2/);
 f.requests[1].callback(new Error('Offline'));assert.match(f.nodes.paymentsMessage.textContent,/Still showing page 1/);
 f.nodes.paymentsNext.events.click();assert.match(f.requests[2].url,/page=2/);f.requests[2].callback(null,{items:[],total:60});
 f.nodes.paymentsNext.events.click();assert.match(f.requests[3].url,/page=3/);
});
test('investigation filter failure retains the displayed filter and signout ignores old responses',()=>{
 const f=fixture();f.loadPayments();f.requests[0].callback(null,{items:[],total:0});
 f.nodes.paymentsFilter.value='all';f.nodes.paymentsFilter.events.change();assert.match(f.requests[1].url,/page=1&filter=all/);f.requests[1].callback(new Error('Unavailable'));assert.equal(f.nodes.paymentsFilter.value,'attention');
 f.loadPayments();f.clearPayments();f.requests[2].callback(null,{items:[{order_id:'secret'}],total:1});assert.equal(f.nodes.paymentRows.children.length,0);
});
