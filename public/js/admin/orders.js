import { request } from './request.js';
import { formatPrice } from '../menu-card.js';
import { showSkeleton } from '../loading.js';
const el=id=>document.getElementById(id);
const transitions={pending:['accepted','rejected'],accepted:['preparing','rejected'],preparing:['ready','rejected'],ready:['completed'],completed:[],rejected:[]};
let page=1,revision=0,busy=false,selected=null;
const node=(tag,text,className)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(className)value.className=className;return value;};
export function clearOrders() {
  el('orderRows').setAttribute('aria-busy','false');
  revision++;busy=false;selected=null;el('orderRows').replaceChildren();el('orderDetails').replaceChildren();el('orderDialog').close();el('ordersMessage').textContent='';
}
export function loadOrders(nextPage=1) {
  const current=++revision;page=nextPage;
  const finishLoading=showSkeleton(el('orderRows'),3);
  el('ordersMessage').textContent='Loading saved orders…';el('ordersRefresh').disabled=true;
  el('ordersPrev').disabled=el('ordersNext').disabled=true;
  request('/orders?page='+page+'&status='+encodeURIComponent(el('ordersFilter').value),{},(error,data)=>{
    finishLoading();
    if(current!==revision)return;
    el('ordersRefresh').disabled=false;
    if(error){el('ordersMessage').textContent=error.message;return;}
    el('orderRows').replaceChildren();
    el('ordersMessage').textContent=data.total?data.total+' orders · Page '+page:'No orders in this status.';
    el('ordersPrev').disabled=page<=1;el('ordersNext').disabled=page*20>=data.total;
    data.items.forEach(order=>{
      const card=node('article',undefined,'order-card');
      card.append(node('p',order.status.toUpperCase()+' · DEMO','order-badge'),node('h2',order.customer.name),
        node('p',new Date(order.created_at).toLocaleString()),node('p','Reference: '+order.id),
        node('p',order.items.reduce((sum,item)=>sum+item.quantity,0)+' items · '+formatPrice(order.total_cents/100)),
        node('p',order.payment_method==='cod'?'COD · Unpaid':'Online · Simulated, not paid'));
      const open=node('button','View order','admin-button');open.type='button';open.addEventListener('click',()=>openOrder(order));
      card.append(open);el('orderRows').append(card);
    });
  });
}
function openOrder(order) {
  selected=order;el('orderDetails').replaceChildren();el('orderUpdateMessage').textContent='';el('orderNote').value='';
  el('orderNote').required=false;
  el('orderDialogTitle').textContent='Order · '+order.status;
  const box=el('orderDetails'),customer=order.customer;
  box.append(node('p','Reference: '+order.id),node('h3',customer.name),node('p',customer.email+' · '+customer.phone),
    node('p',[customer.address,customer.barangay,customer.city,customer.province,customer.postal].join(', ')));
  if(customer.notes)box.append(node('p','Customer notes: '+customer.notes));
  const list=node('ul');
  order.items.forEach(item=>list.append(node('li',item.quantity+' × '+item.name+' · '+item.label+' — '+formatPrice(item.quantity*item.cents/100))));
  box.append(list,node('strong','Total: '+formatPrice(order.total_cents/100)),node('p','Delivery: ₱0 demo · '+(order.payment_method==='cod'?'COD unpaid':'Online payment simulated — no money received')),
    node('h3','Status history'));
  const history=node('ol');
  order.history.forEach(event=>history.append(node('li',event.status+' · '+new Date(event.at).toLocaleString()+(event.note?' · '+event.note:''))));
  box.append(history);el('orderNextStatus').replaceChildren();
  transitions[order.status].forEach(status=>{const option=node('option',status);option.value=status;el('orderNextStatus').append(option);});
  el('orderUpdateForm').hidden=!transitions[order.status].length;el('orderSave').disabled=false;
  el('orderDialog').showModal();
}
export function initOrders() {
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
    if(status==='rejected'&&!note){el('orderUpdateMessage').textContent='Please give a rejection reason.';return;}
    busy=true;el('orderSave').disabled=true;el('orderUpdateMessage').textContent='Saving…';
    request('/orders/'+selected.id,{method:'PATCH',body:JSON.stringify({status,note,version:selected.version})},(error,data)=>{
      busy=false;el('orderSave').disabled=false;
      if(error){el('orderUpdateMessage').textContent=error.message+' Close this order and refresh before retrying.';return;}
      el('orderDialog').close();openOrder(data.order);el('orderUpdateMessage').textContent='Status saved.';loadOrders(page);
    });
  });
}
