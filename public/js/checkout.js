import { readCart, forgetCart } from './cart-storage.js';
import { resolveCheckout, customerDetails } from './checkout-model.js';
import { formatPrice } from './menu-card.js';
const el = id => document.getElementById(id);
let order, saved, submitting = false;
window.addEventListener('pageshow',event=>{ if(event.persisted) window.location.reload(); });
async function currentOrder() {
  const response = await fetch('/api/menu',{cache:'no-store'});
  if (!response.ok) throw new Error('Unable to verify menu prices. Please try again.');
  const data = await response.json();
  return resolveCheckout(saved,data.items);
}
function drawOrder() {
  el('orderLines').replaceChildren();
  order.lines.forEach(line=>{
    const row = document.createElement('div'); row.className='order-line';
    const name=document.createElement('strong'); name.textContent=line.quantity+' × '+line.name;
    const detail=document.createElement('span'); detail.textContent=line.label+' · '+formatPrice(line.quantity*line.cents/100);
    row.append(name,detail); el('orderLines').append(row);
  });
  el('orderTotal').textContent='Total: '+formatPrice(order.total/100);
}
async function load() {
  saved = readCart();
  if (!saved.length) { el('checkoutStatus').textContent='Your cart is empty. Return to the menu to add items.'; return; }
  try {
    order=await currentOrder(); drawOrder();
    el('checkoutStatus').textContent='Review your order and enter sample delivery details.';
    el('checkoutContent').hidden=false;
  } catch(error) { el('checkoutStatus').textContent=error.message+' Return to the menu and try again.'; }
}
el('checkoutForm').addEventListener('submit',async function confirmDemo(event) {
  event.preventDefault();
  if (submitting) return;
  submitting=true; el('placeOrder').disabled=true; el('checkoutError').textContent='';
  try {
    const customer=customerDetails(new FormData(this));
    const fresh=await currentOrder();
    if(JSON.stringify(fresh)!==JSON.stringify(order)) {
      order=fresh; drawOrder(); throw new Error('Menu prices changed. Review the updated total and confirm again.');
    }
    el('reference').textContent='Demo reference: DEMO-'+crypto.randomUUID().slice(0,8).toUpperCase();
    el('paymentResult').textContent=customer.payment==='cod'?'Cash on delivery · Unpaid (demo).':'Online payment · Simulated success only. No money charged.';
    el('customerResult').textContent=customer.name+' · '+customer.phone+' · '+customer.email;
    el('addressResult').textContent=[customer.address,customer.barangay,customer.city,customer.province,customer.postal].join(', ')+(customer.notes?' · Notes: '+customer.notes:'');
    el('confirmedTotal').textContent='Demo total: '+formatPrice(order.total/100);
    forgetCart(); this.reset(); el('checkoutContent').hidden=true; el('checkoutStatus').textContent='';
    el('confirmation').hidden=false; el('confirmation').focus();
  } catch(error) { el('checkoutError').textContent=error.message; }
  finally { submitting=false; el('placeOrder').disabled=false; }
});
load();
