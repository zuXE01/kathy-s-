import { orderRequest } from '../order-api.js';
import { getAuthClient } from '../auth-client.js';
import { signInPath } from '../routes.js';
const el=id=>document.getElementById(id);
const orderId=new URLSearchParams(location.search).get('order');
const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId||'');
let active=true,busy=false,userId;
const messages={
  'not-started':'Your order is saved. Open Maya test checkout to begin. No payment has been made.',
  creating:'The payment session is being confirmed. Check status again; do not place another order.',
  pending:'Test payment is pending. Finish on Maya’s sandbox page, then check status here.',
  'sandbox-paid':'Test payment verified. No real money was collected. View your orders for restaurant updates.',
  failed:'The test payment failed. This order cannot be prepared. Cancel it from My orders before creating a new demo order.',
  cancelled:'The test payment was cancelled. Cancel this order from My orders before creating a new demo order.',
  expired:'The test checkout expired. Cancel this order from My orders before creating a new demo order.',
  review:'The payment result needs review. Check again later or contact the restaurant; do not pay again.'
};
function hideActions(){['paymentStart','paymentResume','paymentCheck'].forEach(id=>el(id).hidden=true);el('paymentResume').removeAttribute('href');}
function clear(){active=false;hideActions();el('paymentReference').textContent='';el('paymentError').textContent='';el('paymentStatus').textContent='Your session changed. Sign in again to view this payment.';el('paymentSignin').hidden=false;}
function render(result){
  hideActions();
  const status=result.payment.status;
  el('paymentStatus').textContent=messages[status]||messages.review;
  const closed=result.orderStatus&&result.orderStatus!=='pending';
  if(closed)el('paymentStatus').textContent+=' Order status: '+result.orderStatus+'. Do not start another payment for this order.';
  if(['cancelled','rejected'].includes(result.orderStatus)&&status==='sandbox-paid')el('paymentStatus').textContent+=' Payment review required. Contact the restaurant; no refund has been issued.';
  el('paymentCheck').hidden=false;
  el('paymentStart').hidden=status!=='not-started'||closed;
  if(status==='pending'&&result.redirectUrl&&!closed){
    const url=new URL(result.redirectUrl);
    if(url.protocol==='https:'&&['payments-web-sandbox.paymaya.com','payments-web-sandbox.maya.ph'].includes(url.hostname)&&!url.port&&!url.username&&!url.password){el('paymentResume').href=url.href;el('paymentResume').hidden=false;}
  }
}
async function check(action='check'){
  if(busy||!active)return;busy=true;
  hideActions();el('paymentError').textContent='';el('paymentStatus').textContent=action==='start'?'Preparing your test checkout…':'Checking with Maya…';
  try {
    const result=await orderRequest('/api/payments/maya/'+encodeURIComponent(orderId)+'/'+action,{method:'POST'});
    if(!active)return;render(result);
    // Never trust the return URL's result query. Only the verified server response.
    if(action==='start'&&!el('paymentResume').hidden)location.assign(el('paymentResume').href);
  }catch(error){if(active){el('paymentStatus').textContent='Payment is not confirmed. No new order has been placed.';el('paymentError').textContent=error.message;el('paymentCheck').hidden=false;}}
  finally{busy=false;}
}
el('paymentStart').addEventListener('click',()=>check('start'));
el('paymentCheck').addEventListener('click',()=>check());
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
window.addEventListener('pagehide',()=>{active=false;});
async function load(){
  if(!valid){el('paymentStatus').textContent='This payment link is invalid. Open My orders to find your saved order.';return;}
  el('paymentSignin').href=signInPath('/payment.html?order='+orderId);
  try {
    const client=await getAuthClient();
    client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(userId&&session?.user?.id&&session.user.id!==userId))clear();});
    const user=await orderRequest('/api/me');if(!active)return;userId=user.id;
    el('paymentReference').textContent='Order: '+orderId;
    await check();
  }catch(error){if(active){el('paymentStatus').textContent='Sign in to view this payment.';el('paymentError').textContent=error.message;el('paymentSignin').hidden=false;}}
}
load();
