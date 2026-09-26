import { createCart } from './cart-state.js';
import { readCart, saveCart, forgetCart } from './cart-storage.js';
import { formatPrice } from './menu-card.js';
const cart = createCart();
let dialog, launcher, list, total, status, checkout;
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function button(text, callback, label) {
  const element = node('button',text);
  element.type = 'button'; element.addEventListener('click',callback);
  if (label) element.setAttribute('aria-label',label);
  return element;
}
function render() {
  const state = cart.snapshot(); list.replaceChildren();
  if (checkout) checkout.disabled = !state.count;
  try { saveCart(state.items); } catch { /* Checkout reports storage errors explicitly. */ }
  launcher.textContent = 'View cart · ' + state.count + ' · ' + formatPrice(state.total/100);
  launcher.hidden = document.body.classList.contains('restaurant') && !state.count;
  total.textContent = 'Subtotal: ' + formatPrice(state.total/100);
  if (!state.items.length) list.append(node('p','Your cart is empty. Add a favorite from the menu.'));
  state.items.forEach(line => {
    const row = node('article',undefined,'cart-line');
    row.append(node('h3',line.name),node('p',line.section + ' · ' + line.label),node('strong',formatPrice(line.cents*line.quantity/100)));
    const controls = node('div',undefined,'cart-quantity');
    function change(delta) {
      cart.change(line.id,delta); render();
      // Restore keyboard focus after replacing the cart rows.
      const rows = [...list.children], index = state.items.findIndex(item=>item.id===line.id);
      (rows[Math.min(index,rows.length-1)]?.querySelector('button') || dialog.querySelector('button')).focus();
    }
    const plus = button('+',()=>change(1),'Increase quantity of ' + line.name);
    plus.disabled = line.quantity >= 99;
    controls.append(button('−',()=>change(-1),'Decrease quantity of ' + line.name),node('span',String(line.quantity)),plus,
      button('Remove',()=>{ cart.remove(line.id); render(); dialog.querySelector('button').focus(); },'Remove ' + line.name + ' ' + line.label));
    row.append(controls); list.append(row);
  });
}
export function addToCart(item, option) {
  const added = cart.add(item,option); render();
  status.textContent = added ? item.name + ' · ' + option.label + ' added to cart.' : 'Maximum quantity is 99 per option.';
}
export function clearCart() {
  cart.clear();
  forgetCart();
  if (!dialog) return;
  dialog.close(); render(); status.textContent = '';
}
export function initCart() {
  window.addEventListener('pageshow',event=>{ if(event.persisted) window.location.reload(); });
  for (const line of readCart()) {
    try {
      const [id,label]=JSON.parse(line.id);
      if (!Number.isInteger(line.quantity) || line.quantity<1 || line.quantity>99) continue;
      for(let n=0;n<line.quantity;n++) cart.add({id,name:line.name,section:line.section},{label,price:line.cents/100});
    } catch { /* Ignore a corrupt saved line. */ }
  }
  launcher = button('View cart · 0 · ₱0',()=>dialog.showModal());
  launcher.className = 'cart-launcher'; launcher.setAttribute('aria-haspopup','dialog');
  status = node('p',undefined,'cart-status'); status.setAttribute('role','status');
  dialog = node('dialog',undefined,'cart-dialog'); dialog.setAttribute('aria-labelledby','cartTitle');
  const heading = node('h2','Your cart'); heading.id = 'cartTitle';
  const header = node('div',undefined,'cart-header');
  header.append(heading,button('Close',()=>dialog.close()));
  list = node('div',undefined,'cart-lines');
  total = node('p',undefined,'cart-total'); total.setAttribute('aria-live','polite');
  checkout = button('Continue to checkout',function openCheckout() {
    try { saveCart(cart.snapshot().items); window.location.assign('/checkout.html'); }
    catch { status.textContent='Enable browser session storage to continue to checkout.'; }
  });
  dialog.append(header,list,total,node('p','Checkout saves your order for admin review. Payments and delivery booking remain demo-only.','cart-note'),checkout);
  document.getElementById('signedInView').append(launcher,status,dialog);
  render();
}
