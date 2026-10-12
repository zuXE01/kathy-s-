import {request} from './request.js';
const el=id=>document.getElementById(id);
let page=1,busy=false,generation=0,total=0,filter='attention';
function text(tag,value){const node=document.createElement(tag);node.textContent=value;return node;}
export function clearPayments(){generation++;busy=false;page=1;total=0;filter='attention';el('paymentRows').replaceChildren();el('paymentsMessage').textContent='';el('paymentsFilter').value='attention';el('paymentsFilter').disabled=false;}
export function loadPayments(nextPage=page){
 if(busy)return;busy=true;const current=generation,requestedFilter=el('paymentsFilter').value;
 el('paymentsRefresh').disabled=true;el('paymentsFilter').disabled=true;el('paymentsPrev').disabled=true;el('paymentsNext').disabled=true;el('paymentsMessage').textContent='Loading payment investigations…';
 request('/payments?page='+nextPage+'&filter='+requestedFilter,{},(error,data)=>{
   if(current!==generation)return;busy=false;el('paymentsRefresh').disabled=false;
   el('paymentsFilter').disabled=false;
   if(error){el('paymentsFilter').value=filter;el('paymentsMessage').textContent=error.message+' Still showing page '+page+'. Use Refresh payments to retry.';el('paymentsPrev').disabled=page===1;el('paymentsNext').disabled=page*20>=total;return;}
   page=nextPage;total=data.total;filter=requestedFilter;
   el('paymentRows').replaceChildren();
   data.items.forEach(row=>{
     const article=document.createElement('article');article.className='order-card';
     article.append(text('h2','Order '+row.order_id.slice(0,8)),text('p','Payment: '+row.status+' · Order: '+row.order_status),
       text('p',new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(row.amount_cents/100)+' · '+row.attempts+' attempt(s)'),
       text('p','Last verified: '+(row.last_verified_at?new Date(row.last_verified_at).toLocaleString():'Not yet confirmed')),
       text('p','Order reference: '+row.order_id));
     if(row.recovery_needs_attention||row.paid_attempts>1||(['cancelled','rejected'].includes(row.order_status)&&row.status==='sandbox-paid')){
       const warning=text('p',row.paid_attempts>1?'Multiple test payments detected. Investigate every attempt; no refund is automatic.':row.recovery_needs_attention?'Automatic recovery needs attention. Recheck with Maya and review the history.':'Payment received for a closed order. No refund has been issued.');warning.className='payment-review-notice';article.append(warning);
     }
     const recheck=text('button','Recheck with Maya');recheck.type='button';recheck.className='admin-button';
     const feedback=text('p','');feedback.setAttribute('role','status');
     recheck.addEventListener('click',()=>{
       if(recheck.disabled)return;recheck.disabled=true;feedback.textContent='Verifying with Maya…';
       request('/payments/'+row.order_id+'/recheck',{method:'POST'},error=>{if(current!==generation)return;recheck.disabled=false;feedback.textContent=error?error.message:'Verification complete. Refresh payments to see the latest result.';});
     });
     const details=document.createElement('details'),summary=text('summary','Payment audit history'),history=document.createElement('div');details.append(summary,history);
     let historyBusy=false,loaded=false;
     details.addEventListener('toggle',()=>{
       if(!details.open||historyBusy||loaded)return;historyBusy=true;history.textContent='Loading history…';
       request('/payments/'+row.order_id+'/history',{},(error,data)=>{if(current!==generation)return;historyBusy=false;if(error){history.textContent=error.message+' Close and reopen to retry.';return;}loaded=true;history.replaceChildren();data.items.forEach(event=>history.append(text('p',new Date(event.created_at).toLocaleString()+' · '+event.event.replaceAll('_',' ')+' · '+event.status+' · Attempt '+event.attempt_id.slice(0,8))));if(!data.items.length)history.textContent='No recorded events yet.';});
     });
     article.append(recheck,feedback,details);el('paymentRows').append(article);
   });
   el('paymentsMessage').textContent=data.items.length?'Page '+page+' · '+data.total+' saved payments. Only Maya verification can confirm payment.':'No payments on this page.';
   el('paymentsPrev').disabled=page===1;el('paymentsNext').disabled=page*20>=data.total;
 });
}
export function initPayments(){
 el('paymentsRefresh').addEventListener('click',()=>loadPayments());
 el('paymentsFilter').addEventListener('change',()=>loadPayments(1));
 el('paymentsPrev').addEventListener('click',()=>{if(!busy&&page>1)loadPayments(page-1);});
 el('paymentsNext').addEventListener('click',()=>{if(!busy)loadPayments(page+1);});
}
