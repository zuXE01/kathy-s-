import { orderRequest } from '../order-api.js';
import { formatPrice } from '../menu-card.js';
import { showSkeleton } from '../loading.js';
import { getAuthClient } from '../auth-client.js';
const el=id=>document.getElementById(id);
let page=1,total=0,revision=0,userId=null,finishLoading=()=>{};
function clearHistory(message) {
  revision++;finishLoading();userId=null;page=1;total=0;
  el('orderHistory').replaceChildren();el('orderHistory').setAttribute('aria-busy','false');
  el('ordersPrevious').disabled=el('ordersNext').disabled=true;
  el('ordersRetry').hidden=true;el('ordersPage').textContent='';el('ordersStatus').textContent=message;
}
window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
window.addEventListener('pagehide',()=>clearHistory('Sign in to view your orders.'));
const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
function date(value){const parsed=new Date(value);return Number.isNaN(parsed.valueOf())?'Date unavailable':parsed.toLocaleString();}
function renderOrder(order){
  const card=node('article',undefined,'history-card');
  const heading=node('div',undefined,'history-heading');
  heading.append(node('div',order.status.toUpperCase(),'order-status status-'+order.status),node('time',date(order.created_at)));
  card.append(heading,node('p','Reference: '+order.id,'history-reference'));
  const list=node('ul',undefined,'history-items');
  order.items.forEach(item=>list.append(node('li',item.quantity+' × '+item.name+' · '+item.label+' — '+formatPrice(item.quantity*item.cents/100))));
  card.append(list,node('strong','Total: '+formatPrice(order.total_cents/100),'history-total'),node('p',order.payment_method==='cod'?'Cash on delivery · unpaid':'Online payment · simulated','history-payment'));
  const details=document.createElement('details');
  details.append(node('summary','Status history'));
  const history=node('ol',undefined,'history-events');
  order.history.forEach(event=>history.append(node('li',event.status+' · '+date(event.at)+(event.note?' · '+event.note:''))));
  details.append(history);card.append(details);
  if(order.status==='pending'){
    const cancel=node('button','Cancel order','history-cancel');cancel.type='button';
    cancel.addEventListener('click',async()=>{
      if(!userId)return;
      if(!window.confirm('Cancel this pending order?'))return;
      const current=revision;
      cancel.disabled=true;
      try { await orderRequest('/api/orders/'+encodeURIComponent(order.id)+'/cancel',{method:'POST'}); if(current===revision)load(page); }
      catch(error){ if(current===revision){cancel.disabled=false; el('ordersStatus').textContent=error.message;} }
    });
    card.append(cancel);
  }
  return card;
}
function render(data){
  const history=el('orderHistory');history.replaceChildren();
  total=data.total||0;
  if(!data.items.length){history.append(node('p','You have no saved orders yet. Explore the menu to place your first demo order.','history-empty'));}
  else data.items.forEach(order=>history.append(renderOrder(order)));
  const last=page*10>=total;
  el('ordersPage').textContent='Page '+page;
  el('ordersPrevious').disabled=page<=1;
  el('ordersNext').disabled=last;
}
async function load(nextPage=1){
  if(!userId)return;
  const current=++revision,finish=showSkeleton(el('ordersLoading'),2);
  finishLoading=finish;
  el('orderHistory').replaceChildren();el('orderHistory').setAttribute('aria-busy','true');
  page=nextPage;el('ordersRetry').hidden=true;el('ordersStatus').textContent='Loading your orders…';el('ordersPrevious').disabled=el('ordersNext').disabled=true;
  try {
    const data=await orderRequest('/api/orders?page='+page);
    if(current!==revision)return;
    render(data);el('ordersStatus').textContent=data.total?data.total+' saved order'+(data.total===1?'':'s'):'No saved orders yet.';
  } catch(error) {
    if(current!==revision)return;
    el('ordersStatus').textContent=error.message;el('ordersRetry').hidden=false;el('orderHistory').replaceChildren();
  } finally {finish();if(current===revision)el('orderHistory').setAttribute('aria-busy','false');}
}
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
