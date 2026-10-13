import { orderRequest } from '../order-api.js';
import { formatPrice } from '../menu-card.js';
import { showSkeleton } from '../loading.js';
import { getAuthClient } from '../auth-client.js';
const el=id=>document.getElementById(id);
let page=1,total=0,revision=0,userId=null,finishLoading=()=>{};
let timer=null,activeRead=null,mutating=false,autoPaused=false,lastData=null,lastUpdated=null;
function stopRefresh(){clearTimeout(timer);timer=null;}
function schedule(){
  stopRefresh();
  if(userId&&!document.hidden&&!autoPaused)timer=setTimeout(()=>load(page,{background:true}),15000);
}
function interacting(){return el('orderHistory').contains(document.activeElement)||Boolean(el('orderHistory').querySelector('details[open]'));}
function pagination(){el('ordersPrevious').disabled=!userId||page<=1;el('ordersNext').disabled=!userId||page*10>=total;}
function clearHistory(message) {
  stopRefresh();activeRead=null;mutating=false;autoPaused=false;lastData=null;lastUpdated=null;
  revision++;finishLoading();userId=null;page=1;total=0;
  el('orderHistory').replaceChildren();el('orderHistory').setAttribute('aria-busy','false');
  el('ordersPrevious').disabled=el('ordersNext').disabled=true;
  el('ordersRetry').hidden=true;el('ordersPage').textContent='';el('ordersStatus').textContent=message;
  el('ordersRefresh').disabled=true;el('ordersUpdated').textContent='';
}
window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
window.addEventListener('pagehide',()=>clearHistory('Sign in to view your orders.'));
const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
function date(value){const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?'Date unavailable':parsed.toLocaleString();}
function renderOrder(order){
  const card=node('article',undefined,'history-card');
  const heading=node('div',undefined,'history-heading');
  heading.append(node('div',order.status.toUpperCase(),'order-status status-'+order.status),node('time',date(order.created_at)));
  const explanations={pending:'Awaiting restaurant acceptance. You can cancel while this order is pending.',accepted:'The restaurant has accepted your order. Preparation has not started yet.',preparing:'The kitchen is preparing your order.',ready:'Preparation is complete. No delivery is booked through this demo.',completed:'The restaurant marked this order as completed.',rejected:'The restaurant could not fulfil this order. Check the status history for a reason.',cancelled:'This order was cancelled and will not be prepared.'};
  card.append(heading,node('p',explanations[order.status]||'Check the status history for updates.'),node('p','Reference: '+order.id,'history-reference'));
  const list=node('ul',undefined,'history-items');
  order.items.forEach(item=>list.append(node('li',item.quantity+' × '+item.name+' · '+item.label+' — '+formatPrice(item.quantity*item.cents/100))));
  const paymentLabels={'not-started':'not started',creating:'confirming checkout',pending:'awaiting payment','sandbox-paid':'test payment verified',failed:'test payment failed',cancelled:'test payment cancelled',expired:'test checkout expired',review:'payment needs review'};
  card.append(list,node('strong','Total: '+formatPrice(order.total_cents/100),'history-total'),node('p',order.payment_method==='maya-sandbox'?'Maya sandbox · '+(paymentLabels[order.payment_status]||'check payment status')+' · no real money':order.payment_method==='cod'?'Cash on delivery · unpaid':'Online payment · simulated','history-payment'));
  if(order.payment_method==='maya-sandbox'){const payment=node('a','View test payment','button');payment.href='/payment.html?order='+encodeURIComponent(order.id);card.append(payment);}
  if(order.payment_review_required)card.append(node('p','Your test payment was received, but this order is closed. Contact the restaurant for review. No refund has been issued.','payment-review-notice'));
  const details=document.createElement('details');
  details.append(node('summary','Status history'));
  const history=node('ol',undefined,'history-events');
  order.history.forEach(event=>history.append(node('li',event.status+' · '+date(event.at)+(event.note?' · '+event.note:''))));
  details.append(history);card.append(details);
  if(order.status==='pending'){
    const cancel=node('button','Cancel order','history-cancel');cancel.type='button';
    cancel.addEventListener('click',async()=>{
      if(!userId||mutating||activeRead)return;
      if(!window.confirm(order.payment_method==='maya-sandbox'?'Cancel this order? We must first confirm that Maya has closed the unpaid test checkout. A confirmed payment requires restaurant review.':'Cancel this order? It will be removed from the restaurant’s pending queue.'))return;
      const current=revision;
      cancel.disabled=true;mutating=true;stopRefresh();el('ordersRefresh').disabled=true;
      try { await orderRequest('/api/orders/'+encodeURIComponent(order.id)+'/cancel',{method:'POST'}); if(current===revision){mutating=false;await load(page);} }
      catch(error){ if(current===revision){cancel.disabled=false;el('ordersStatus').textContent=error.message;mutating=false;el('ordersRefresh').disabled=false;schedule();} }
    });
    card.append(cancel);
  }
  return card;
}
function render(data){
  const history=el('orderHistory');history.replaceChildren();
  total=data.total||0;
  if(!data.items.length){
    history.append(node('p',page===1?'You have no saved orders yet. Choose items from the menu to place a demo order.':'No orders on this page. Go to the previous page to see earlier results.','history-empty'));
    const browse=node('a','Browse the menu','button');browse.href='/#menu';history.append(browse);
  }
  else data.items.forEach(order=>history.append(renderOrder(order)));
  const last=page*10>=total;
  el('ordersPage').textContent='Page '+page;
  el('ordersPrevious').disabled=page<=1;
  el('ordersNext').disabled=last;
}
async function load(nextPage=page,{background=false}={}){
  if(!userId||activeRead||mutating)return;
  if(background&&(document.hidden||interacting())){schedule();return;}
  stopRefresh();
  if(!background)autoPaused=false;
  const current=revision,request={},finish=lastData?()=>{}:showSkeleton(el('ordersLoading'),2);
  activeRead=request;
  finishLoading=finish;
  el('orderHistory').setAttribute('aria-busy','true');
  el('ordersRefresh').disabled=true;el('ordersRetry').hidden=true;
  if(!background)el('ordersStatus').textContent=lastData?'Updating your orders…':'Loading your orders…';
  el('ordersPrevious').disabled=el('ordersNext').disabled=true;
  try {
    const options=typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(15000)}:{};
    const data=await orderRequest('/api/orders?page='+nextPage,options);
    if(current!==revision)return;
    if(!Array.isArray(data?.items)||!Number.isSafeInteger(data.total)||data.total<0||data.items.some(order=>!order||!Array.isArray(order.items)||!Array.isArray(order.history)||typeof order.status!=='string'))throw new Error('The order list could not be read. Try refreshing again.');
    // A customer may begin reading or focusing a card while the request is pending.
    if(background&&(document.hidden||interacting()))return;
    const changed=page!==nextPage||JSON.stringify(lastData)!==JSON.stringify(data);
    const restoreFocus=!background&&el('orderHistory').contains(document.activeElement);
    page=nextPage;
    if(changed)render(data);
    lastData=data;lastUpdated=new Date();
    el('ordersUpdated').textContent='Last updated '+lastUpdated.toLocaleTimeString()+'.';
    el('ordersStatus').textContent=data.total?data.total+' saved order'+(data.total===1?'':'s'):'No saved orders yet.';
    if(changed&&restoreFocus)el('ordersStatus').focus();
  } catch(error) {
    if(current!==revision)return;
    if(error.status===401||error.status===403){clearHistory('Your session or access changed. Sign in again to view your orders.');return;}
    if(error.status===429)autoPaused=true;
    const reason=error.status===429?'Too many checks. Automatic updates are paused; wait before trying again.':error.name==='TimeoutError'?'The connection took too long. Try again.':'Unable to update your orders. Check your connection and try again.';
    el('ordersStatus').textContent=reason+(lastData?' Your last loaded orders are still shown.':'');el('ordersRetry').hidden=false;
  } finally {
    finish();
    if(current===revision&&activeRead===request){activeRead=null;el('orderHistory').setAttribute('aria-busy','false');el('ordersRefresh').disabled=false;pagination();schedule();}
  }
}
el('ordersRefresh').addEventListener('click',()=>load(page));
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopRefresh();else if(userId&&!autoPaused)load(page,{background:true});});
el('ordersRetry').addEventListener('click',()=>load(page));
el('ordersPrevious').addEventListener('click',()=>load(page-1));
el('ordersNext').addEventListener('click',()=>load(page+1));
getAuthClient().then(client=>{
  client.auth.onAuthStateChange((event,session)=>{
    const nextId=event==='SIGNED_OUT'?null:session?.user?.id;
    if(!nextId){clearHistory('Sign in to view your orders.');return;}
    if(nextId===userId)return;
    clearHistory('Loading your orders…');userId=nextId;
    const current=revision;
    // Leave the auth callback before making requests through the SDK.
    setTimeout(()=>{if(current===revision)load(1);},0);
  });
}).catch(()=>clearHistory('Unable to connect. Reload to try again.'));
