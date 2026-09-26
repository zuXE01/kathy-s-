import { readCart, forgetCart } from '../cart-storage.js';
import { resolveCheckout, customerDetails } from '../checkout-model.js';
import { formatPrice } from '../menu-card.js';
import { orderRequest } from '../order-api.js';
import { getAuthClient } from '../auth-client.js';
import { showSkeleton } from '../loading.js';
import { loadContact } from '../account-client.js';
import { prefillContact } from '../account-model.js';
const el=id=>document.getElementById(id), requestKey='kathys-checkout-request';
let order,saved,submitting=false,requestId,userId,active=true;
window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
async function currentOrder() {
  const response=await fetch('/api/menu',{cache:'no-store'});
  if(!response.ok)throw new Error('Unable to verify menu prices. Please try again.');
  return resolveCheckout(saved,(await response.json()).items);
}
function drawOrder() {
  el('orderLines').replaceChildren();
  order.lines.forEach(line=>{
    const row=document.createElement('div');row.className='order-line';
    const name=document.createElement('strong');name.textContent=line.quantity+' × '+line.name;
    const detail=document.createElement('span');detail.textContent=line.label+' · '+formatPrice(line.quantity*line.cents/100);
    row.append(name,detail);el('orderLines').append(row);
  });
  el('orderTotal').textContent='Total: '+formatPrice(order.total/100);
}
function confirmation(value) {
  const customer=value.customer;
  el('reference').textContent='Order reference: '+value.id;
  el('paymentResult').textContent=value.payment_method==='cod'?'COD · Payment unpaid.':'Demo online · Simulated only; not a real payment.';
  el('customerResult').textContent=customer.name+' · '+customer.phone+' · '+customer.email;
  el('addressResult').textContent=[customer.address,customer.barangay,customer.city,customer.province,customer.postal].join(', ');
  el('confirmedTotal').textContent='Saved total: '+formatPrice(value.total_cents/100);
  el('confirmationTitle').textContent='Order saved · '+value.status;
  forgetCart(); sessionStorage.removeItem(requestKey);
  el('checkoutForm').reset();el('checkoutContent').hidden=true;el('checkoutStatus').textContent='';
  el('confirmation').hidden=false;el('confirmation').focus();
}
async function load() {
  const loading=el('checkoutLoading');loading.hidden=false;
  const finishLoading=showSkeleton(loading,2);
  try {
    const client=await getAuthClient();
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'||(userId&&session?.user?.id&&session.user.id!==userId)) {
        active=false; el('checkoutForm').reset();el('checkoutContent').hidden=true;el('confirmation').hidden=true;
        ['customerResult','addressResult','paymentResult','reference','confirmedTotal'].forEach(id=>el(id).textContent='');
        sessionStorage.removeItem(requestKey);el('checkoutStatus').textContent='Your session changed. Return to the menu and sign in.';
      }
    });
    const user=await orderRequest('/api/me');userId=user.id;
    if(!active)return;
    let previous;
    try {previous=JSON.parse(sessionStorage.getItem(requestKey)||'null');}catch{}
    if(previous?.userId===userId) {
      requestId=previous.id;
      const result=await orderRequest('/api/orders/request/'+encodeURIComponent(requestId));
      if(!active)return;
      if(result.order){confirmation(result.order);return;}
    } else sessionStorage.removeItem(requestKey);
    saved=readCart();
    if(!saved.length){el('checkoutStatus').textContent='Your cart is empty. Return to the menu to add items.';return;}
    order=await currentOrder();if(!active)return;drawOrder();
    el('checkoutForm').elements.name.value=typeof user.name==='string'?user.name:'';
    el('checkoutForm').elements.email.value=user.email||'';
    el('checkoutStatus').textContent='Your order and contact details will be saved and visible to restaurant admins.';
    try {
      const contact=await loadContact(userId);
      if(!active)return;
      if(contact) {
        prefillContact(el('checkoutForm'),contact);
        el('checkoutStatus').textContent='Your saved contact details have been filled in. Review them before ordering. Changes here apply only to this order.';
      }
    } catch {
      if(!active)return;
      el('checkoutStatus').textContent='Your saved address could not be loaded. Enter your details below, or reload to retry.';
    }
    el('checkoutContent').hidden=false;
  } catch(error){el('checkoutStatus').textContent=error.message+' Reload to retry, or return to the menu.';}
  finally {finishLoading();loading.hidden=true;}
}
el('checkoutForm').addEventListener('submit',async function submitOrder(event) {
  event.preventDefault();if(submitting||!active)return;
  submitting=true;el('placeOrder').disabled=true;el('checkoutError').textContent='';
  el('placeOrder').textContent='Saving your order…';
  el('placeOrder').setAttribute('aria-busy','true');
  try {
    const customer=customerDetails(new FormData(this));
    requestId=requestId||crypto.randomUUID();
    // Persist only a random request ID and owner, never customer details.
    sessionStorage.setItem(requestKey,JSON.stringify({id:requestId,userId}));
    const items=order.lines.map(line=>({product_id:JSON.parse(line.id)[0],label:line.label,quantity:line.quantity}));
    const result=await orderRequest('/api/orders',{method:'POST',body:JSON.stringify({request_id:requestId,customer,items,total_cents:order.total,payment_method:customer.payment})});
    if(active)confirmation(result.order);
  } catch(error) {
    if(!active)return;
    el('checkoutError').textContent=error.message;
    if(error.status===409) {
      try {order=await currentOrder();drawOrder();} catch(menuError){el('checkoutError').textContent=menuError.message;}
    }
  } finally {submitting=false;el('placeOrder').disabled=false;el('placeOrder').textContent='Place demo order';el('placeOrder').setAttribute('aria-busy','false');}
});
load();
