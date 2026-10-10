import { request } from './request.js';
import { formatPrice } from '../menu-card.js';
import { showSkeleton } from '../loading.js';
const el=id=>document.getElementById(id);
const transitions={pending:['accepted','rejected','cancelled'],accepted:['preparing','rejected'],preparing:['ready','rejected'],ready:['completed'],completed:[],rejected:[],cancelled:[]};
let page=1,revision=0,busy=false,selected=null;
let visible=false,timer,inFlight=false,queued=null,lastUpdated=null;
function scheduleRefresh() {
  if(typeof setTimeout!=='function')return;
  clearTimeout(timer);
  if(visible)timer=setTimeout(()=>{
    if(!document.hidden&&!busy&&!el('orderDialog').open&&!el('orderRows').contains(document.activeElement))loadOrders(page,true);
    else scheduleRefresh();
  },15000);
}
export function setOrdersVisible(value) {
  visible=value; if(typeof clearTimeout==='function')clearTimeout(timer);
  if(visible)scheduleRefresh();
}
const node=(tag,text,className)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(className)value.className=className;return value;};
export function clearOrders() {
  setOrdersVisible(false);inFlight=false;queued=null;lastUpdated=null;
  el('orderRows').setAttribute('aria-busy','false');
  revision++;busy=false;selected=null;el('orderRows').replaceChildren();el('orderDetails').replaceChildren();el('orderDialog').close();el('ordersMessage').textContent='';
}
export function loadOrders(nextPage=1,background=false) {
  if(inFlight||busy){if(!background)queued={nextPage,background};return;}
  inFlight=true;
  const current=++revision;page=nextPage;
  const finishLoading=background?()=>{}:showSkeleton(el('orderRows'),3);
  if(!background)el('ordersMessage').textContent='Loading saved orders…';el('ordersRefresh').disabled=true;
  el('ordersPrev').disabled=el('ordersNext').disabled=true;
  request('/orders?page='+page+'&status='+encodeURIComponent(el('ordersFilter').value),{},(error,data)=>{
    finishLoading();
    if(current!==revision)return;
    inFlight=false;
    if(queued){const next=queued;queued=null;loadOrders(next.nextPage,next.background);return;}
    el('ordersRefresh').disabled=false;
    if(error){el('ordersMessage').textContent='Could not refresh orders. '+error.message+' Choose Refresh orders to retry.'+(lastUpdated?' Last successful update: '+lastUpdated+'.':'');scheduleRefresh();return;}
    if(background&&(!visible||document.hidden||busy||el('orderDialog').open||el('orderRows').contains(document.activeElement))){scheduleRefresh();return;}
    lastUpdated=new Date().toLocaleTimeString();
    el('orderRows').replaceChildren();
    el('ordersMessage').textContent=(data.total?data.total+' orders · Page '+page:'No orders in this status.')+' · Updated '+lastUpdated+'. Auto-refresh checks every 15 seconds while this queue is visible and you are not working in it.';
    if(data.items.some(order=>order.contact_status==='unavailable'))el('ordersMessage').textContent+=' Customer contact details could not load. Refresh to retry; if this persists, ask the owner to verify database setup.';
    el('ordersPrev').disabled=page<=1;el('ordersNext').disabled=page*20>=data.total;
    data.items.forEach(order=>{
      const card=node('article',undefined,'order-card');
      card.append(node('p',order.status.toUpperCase()+' · DEMO','order-badge order-status status-'+order.status),node('h2',order.customer?.name || 'Order '+order.id.slice(0,8)),
        node('p',new Date(order.created_at).toLocaleString()),node('p','Reference: '+order.id),
        node('p',order.items.reduce((sum,item)=>sum+item.quantity,0)+' items · '+formatPrice(order.total_cents/100)),
        node('p',order.payment_method==='maya-sandbox'?'Maya sandbox · '+order.payment_status+' · no real money':order.payment_method==='cod'?'COD · Unpaid':'Online · Simulated, not paid'));
      const elapsed=Math.max(0,Math.floor((Date.now()-new Date(order.created_at).getTime())/60000));
      if(Number.isFinite(elapsed)&&['pending','accepted','preparing','ready'].includes(order.status))card.append(node('p',elapsed===0?'Received less than a minute ago':'Received '+elapsed+' min ago','queue-age'));
      const items=node('ul',undefined,'queue-items');
      order.items.forEach(item=>items.append(node('li',item.quantity+' × '+item.name+' · '+item.label)));
      card.append(items);
      const open=node('button','View order','admin-button');open.type='button';open.addEventListener('click',()=>openOrder(order));
      const actions=node('div',undefined,'queue-actions');actions.append(open);
      const next=(order.allowed_statuses||[]).find(status=>['accepted','preparing','ready','completed'].includes(status)&&(transitions[order.status]||[]).includes(status));
      if(next){
        const labels={accepted:'Accept order',preparing:'Start preparing',ready:'Mark ready',completed:'Mark completed'};
        const advance=node('button',labels[next],'admin-button');advance.type='button';
        advance.addEventListener('click',()=>quickUpdate(order,next,advance));actions.append(advance);
      }
      card.append(actions);el('orderRows').append(card);
    });
    scheduleRefresh();
  });
}
function quickUpdate(order,status,button) {
  if(busy||inFlight)return;
  busy=true;button.disabled=true;button.textContent='Updating…';
  const current=revision;
  request('/orders/'+order.id,{method:'PATCH',body:JSON.stringify({status,note:'',version:order.version})},(error)=>{
    if(current!==revision)return;
    busy=false;
    if(error){button.textContent='Refresh before retrying';button.disabled=true;el('ordersMessage').textContent=error.message+' Choose Refresh orders to get the latest status before trying again.';scheduleRefresh();return;}
    // Move focus outside replaced cards, only after an explicit user action.
    el('ordersRefresh').focus();queued=null;loadOrders(page);
  });
}
function openOrder(order) {
  selected=order;el('orderDetails').replaceChildren();el('orderUpdateMessage').textContent='';el('orderNote').value='';
  el('orderNote').required=false;
  el('orderDialogTitle').textContent='Order · '+order.status;
  const box=el('orderDetails'),customer=order.customer;
  box.append(node('p',order.status.toUpperCase(),'order-status status-'+order.status),node('p','Reference: '+order.id));
  if(customer)box.append(node('h3',customer.name),node('p',customer.email+' · '+customer.phone),
    node('p',[customer.address,customer.barangay,customer.city,customer.province,customer.postal].join(', ')));
  if(customer?.notes)box.append(node('p','Customer notes: '+customer.notes));
  if(order.contact_status==='unavailable')box.append(node('p','Customer contact and delivery details could not load. Close this order and refresh to retry. Do not dispatch until the delivery details are available.'));
  const list=node('ul');
  order.items.forEach(item=>list.append(node('li',item.quantity+' × '+item.name+' · '+item.label+' — '+formatPrice(item.quantity*item.cents/100))));
  box.append(list,node('strong','Total: '+formatPrice(order.total_cents/100)),node('p','Delivery: ₱0 demo · '+(order.payment_method==='maya-sandbox'?'Maya sandbox: '+order.payment_status+' — no real money':order.payment_method==='cod'?'COD unpaid':'Online payment simulated — no money received')),
    node('h3','Status history'));
  const history=node('ol');
  order.history.forEach(event=>history.append(node('li',event.status+' · '+new Date(event.at).toLocaleString()+(event.note?' · '+event.note:''))));
  const historyDetails=node('details');historyDetails.append(node('summary','Show status history'),history);
  box.append(historyDetails);el('orderNextStatus').replaceChildren();
  const allowed=(order.allowed_statuses||[]).filter(status=>(transitions[order.status]||[]).includes(status));
  const actionLabels={accepted:'Accept order',preparing:'Start preparing',ready:'Mark ready',completed:'Mark completed',rejected:'Reject order',cancelled:'Cancel order'};
  allowed.forEach(status=>{const option=node('option',actionLabels[status]||status);option.value=status;el('orderNextStatus').append(option);});
  el('orderUpdateForm').hidden=!allowed.length;el('orderSave').disabled=false;
  if(!allowed.length)el('orderUpdateMessage').textContent='No status actions are available for your role at this stage.';
  el('orderDialog').showModal();
}
export function initOrders() {
  window.addEventListener('pagehide',()=>setOrdersVisible(false));
  document.addEventListener('visibilitychange',()=>{if(visible)scheduleRefresh();});
  el('ordersRefresh').addEventListener('click',()=>loadOrders(page));
  el('ordersFilter').addEventListener('change',()=>loadOrders());
  el('ordersPrev').addEventListener('click',()=>loadOrders(page-1));
  el('ordersNext').addEventListener('click',()=>loadOrders(page+1));
  el('orderClose').addEventListener('click',()=>{if(!busy)el('orderDialog').close();});
  el('orderDialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  el('orderNextStatus').addEventListener('change',()=>{el('orderNote').required=el('orderNextStatus').value==='rejected';});
  el('orderUpdateForm').addEventListener('submit',event=>{
    event.preventDefault();if(busy||!selected)return;
    const status=el('orderNextStatus').value,note=el('orderNote').value.trim();
    if(status==='rejected'&&!note){el('orderUpdateMessage').textContent='Enter a reason for rejecting this order. The customer can see it in their status history.';return;}
    busy=true;el('orderSave').disabled=true;el('orderUpdateMessage').textContent='Updating order status…';
    const current=revision;
    request('/orders/'+selected.id,{method:'PATCH',body:JSON.stringify({status,note,version:selected.version})},(error,data)=>{
      if(!selected||current!==revision)return;
      busy=false;el('orderSave').disabled=false;
      if(error){el('orderUpdateMessage').textContent=error.message+' Close this order and refresh before retrying.';return;}
      el('orderDialog').close();openOrder(data.order);el('orderUpdateMessage').textContent='Status saved.';loadOrders(page);
    });
  });
}
