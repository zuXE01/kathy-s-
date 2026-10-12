import { orderRequest } from '../order-api.js';
import { getAuthClient } from '../auth-client.js';
import { signInPath } from '../routes.js';
const el=id=>document.getElementById(id);
const orderId=new URLSearchParams(location.search).get('order');
const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId||'');
let active=true,busy=false,userId,attemptId,lastResult,timer,automaticChecks=0;
const statuses=new Set(['not-started','creating','pending','sandbox-paid','failed','cancelled','expired','review']);
const actionIds=['paymentStart','paymentResume','paymentCheck','paymentRetry'];
function stopChecks(){clearTimeout(timer);timer=undefined;}
function scheduleCheck(){
  stopChecks();
  if(!active||document.hidden||automaticChecks>=8||!['creating','pending','review'].includes(lastResult?.payment.status))return;
  timer=setTimeout(()=>{automaticChecks++;void check('check',true);},15000);
}
function setBusy(value){
  actionIds.forEach(id=>{const control=el(id);if(control){control.disabled=value;control.setAttribute('aria-disabled',String(value));control.setAttribute('aria-busy',String(value));}});
  el('paymentCheck').textContent=value?'Checking with Maya…':'Check payment status';
}
const messages={
  'not-started':'Your order is saved. Open Maya test checkout to begin. No payment has been made.',
  creating:'Your order is saved. We are checking whether Maya opened your test checkout. Do not pay again or place another order.',
  pending:'Test payment pending. Complete payment on Maya’s test page, then return here for confirmation.',
  'sandbox-paid':'Test payment verified. No real money was collected. Track my order shows whether the restaurant has accepted it.',
  failed:'Maya reports that this test payment failed. Your order is still saved.',
  cancelled:'Maya reports that this test payment was cancelled. This does not cancel your restaurant order.',
  expired:'This test checkout expired. Your order is still saved.',
  review:'We could not confirm the payment result. Check again or contact the restaurant. Do not pay again.'
};
function hideActions(){[...actionIds,'paymentTrack','paymentRecovery'].forEach(id=>{if(el(id))el(id).hidden=true;});el('paymentResume').removeAttribute('href');}
function clear(){active=false;stopChecks();lastResult=undefined;attemptId=undefined;hideActions();el('paymentFreshness').textContent='';el('paymentReference').textContent='';el('paymentError').textContent='';el('paymentStatus').textContent='Your session changed. Sign in again to view this payment.';el('paymentSignin').hidden=false;}
function render(result){
  if(!result?.payment||!statuses.has(result.payment.status))throw new Error('The payment response could not be read. Check again; do not pay again.');
  if(lastResult?.payment.status==='sandbox-paid'&&result.payment.status!=='sandbox-paid')result=lastResult;
  lastResult=result;
  hideActions();
  const status=result.payment.status;
  attemptId=result.payment.attemptId;
  el('paymentStatus').textContent=messages[status]||messages.review;
  if(result.payment.providerStatus==='NOT_STARTED')el('paymentStatus').textContent='No Maya test checkout was opened for this order.';
  const closed=result.orderStatus&&result.orderStatus!=='pending';
  if(closed)el('paymentStatus').textContent+=' Restaurant order: '+result.orderStatus+'. No further payment can be started for this order.';
  if(['cancelled','rejected'].includes(result.orderStatus)&&status==='sandbox-paid')el('paymentStatus').textContent+=' Payment review required. Contact the restaurant; no refund has been issued.';
  el('paymentCheck').hidden=status==='sandbox-paid';
  el('paymentTrack').hidden=status!=='sandbox-paid';
  el('paymentStart').hidden=status!=='not-started'||closed;
  if(el('paymentRetry'))el('paymentRetry').hidden=closed||!attemptId||!['failed','cancelled','expired'].includes(status)||result.payment.providerStatus==='NOT_STARTED';
  if(!el('paymentRetry').hidden)el('paymentStatus').textContent+=' Try payment again keeps this order. We first check that the previous checkout is closed.';
  if(status==='pending'&&result.redirectUrl&&!closed){
    try {
      const url=new URL(result.redirectUrl);
      if(url.protocol==='https:'&&['payments-web-sandbox.paymaya.com','payments-web-sandbox.maya.ph'].includes(url.hostname)&&!url.port&&!url.username&&!url.password){el('paymentResume').href=url.href;el('paymentResume').hidden=false;}
    }catch{} // Malformed destinations never replace a valid saved-order state.
  }
  if(status==='pending'&&!closed&&el('paymentResume').hidden){el('paymentRecovery').hidden=false;el('paymentStatus').textContent='Your order is saved. Maya reports an unpaid checkout, but its link could not be recovered. Do not pay again.';}
  el('paymentFreshness').textContent='Last checked: '+new Date().toLocaleTimeString()+(['creating','pending','review'].includes(status)?(automaticChecks>=8?' · Automatic checks have stopped. Select Check payment status to check again.':' · Checks every 15 seconds while this page is visible, up to eight times.'):'');
}
async function check(action='check',automatic=false){
  if(busy||!active)return;busy=true;
  const focused=document.activeElement;
  stopChecks();setBusy(true);el('paymentError').textContent='';
  if(!automatic&&!lastResult)el('paymentStatus').textContent=action==='start'?'Preparing your test checkout…':'Checking with Maya…';
  try {
    const result=await orderRequest('/api/payments/maya/'+encodeURIComponent(orderId)+'/'+action,{method:'POST',...(typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(15000)}:{}),...(action==='retry'?{body:JSON.stringify({attemptId})}:{})});
    if(!active)return;render(result);
    // Never trust the return URL's result query. Only the verified server response.
    if(['start','retry'].includes(action)&&!el('paymentResume').hidden)location.assign(el('paymentResume').href);
  }catch(error){if(active){
    if(error.status===401){clear();return;}
    if([403,404].includes(error.status)){stopChecks();lastResult=undefined;hideActions();el('paymentReference').textContent='';el('paymentFreshness').textContent='';el('paymentStatus').textContent='This payment is unavailable to your account. Open My orders to find your saved order.';}
    else {if(error.status===429)automaticChecks=8;if(!lastResult)el('paymentStatus').textContent='We could not confirm payment. If you already submitted this order, it remains saved. Do not place it again.';el('paymentError').textContent=(error.status===429?'Too many checks. Wait a moment before trying again.':error.message)+(action==='check'?' No new payment attempt was started by this check.':' Your order is saved. Check payment status before trying again; do not pay again.');el('paymentCheck').hidden=lastResult?.payment.status==='sandbox-paid';}
  }}
  finally{busy=false;setBusy(false);if(active){
    if(!automatic&&focused&&actionIds.some(id=>el(id)===focused)&&(document.activeElement===focused||document.activeElement===document.body)){
      (focused.hidden?el('paymentStatus'):focused).focus();
    }
    scheduleCheck();
  }}
}
el('paymentStart').addEventListener('click',()=>check('start'));
el('paymentCheck').addEventListener('click',()=>check());
el('paymentResume').addEventListener('click',event=>{if(busy||!active)event.preventDefault();});
el('paymentRetry')?.addEventListener('click',()=>{if(window.confirm('Try test payment again for this saved order? We will first check with Maya that the previous checkout is closed. This does not create another restaurant order.'))check('retry');});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
window.addEventListener('pagehide',()=>{active=false;stopChecks();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopChecks();else scheduleCheck();});
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
