import { initMenu, setMenuOrderAccess } from '../menu.js';
// Preserve previously issued confirmation and recovery links at the public root.
const hash = new URLSearchParams(location.hash.slice(1));
const query = new URLSearchParams(location.search);
if (hash.has('access_token') || hash.has('error') || query.has('code')) {
  location.replace('/signin.html' + location.search + location.hash);
} else {
  let initialized=false;
  function displayMenu(signedIn) {
    document.getElementById('productShowcase').hidden=signedIn;
    document.getElementById('memberCatalog').hidden=false;
    document.getElementById('menu').setAttribute('aria-labelledby',signedIn?'menuTitle':'showcaseTitle');
    if(!initialized){
      initialized=true;
      let selected = 'all';
      try { selected = sessionStorage.getItem('kathys-menu-section') || 'all'; sessionStorage.removeItem('kathys-menu-section'); } catch {}
      initMenu(selected, {canOrder:signedIn});
    } else {
      setMenuOrderAccess(signedIn);
    }
    document.querySelectorAll('.cart-launcher,.cart-status').forEach(control=>{
      control.hidden=!signedIn || (control.classList.contains('cart-launcher')
        ? control.dataset.empty==='true' : !control.textContent);
    });
    if(!signedIn)document.querySelector('.cart-dialog[open]')?.close();
  }
  window.addEventListener('customer-access-changed',event=>displayMenu(event.detail.signedIn));
  displayMenu(document.body.dataset.menuAccess==='member');
  document.querySelectorAll('[data-order-section]').forEach(link => {
    link.addEventListener('click', () => {
      try { sessionStorage.setItem('kathys-menu-section', link.dataset.orderSection); } catch {}
    });
  });
  document.querySelectorAll('[data-section-pick]').forEach(link => {
    link.addEventListener('click', event => {
      try { sessionStorage.setItem('kathys-menu-section', link.dataset.sectionPick); } catch {}
      const select = document.getElementById('mobileMenuSection');
      if ([...select.options].some(option => option.value === link.dataset.sectionPick)) {
        select.value = link.dataset.sectionPick;
        select.dispatchEvent(new Event('change', {bubbles:true}));
      } else {
        const promotion = [...document.querySelectorAll('[data-promotion]')].find(item => item.dataset.promotion === link.dataset.sectionPick);
        if (promotion) {
          event.preventDefault();
          promotion.scrollIntoView({block:'start'});
          promotion.focus({preventScroll:true});
        }
      }
    });
  });
}
