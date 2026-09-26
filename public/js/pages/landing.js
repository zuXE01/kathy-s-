import { initMenu } from '../menu.js';
// Preserve previously issued confirmation and recovery links at the public root.
const hash = new URLSearchParams(location.hash.slice(1));
const query = new URLSearchParams(location.search);
if (hash.has('access_token') || hash.has('error') || query.has('code')) {
  location.replace('/signin.html' + location.search + location.hash);
} else {
  let initialized=false;
  function displayMenu(signedIn) {
    document.getElementById('productShowcase').hidden=signedIn;
    document.getElementById('memberCatalog').hidden=!signedIn;
    document.getElementById('menu').setAttribute('aria-labelledby',signedIn?'menuTitle':'showcaseTitle');
    if(signedIn&&!initialized){initialized=true;initMenu();}
    document.querySelectorAll('.cart-launcher,.cart-status').forEach(control=>{control.hidden=!signedIn;});
    if(!signedIn)document.querySelector('.cart-dialog[open]')?.close();
  }
  window.addEventListener('customer-access-changed',event=>displayMenu(event.detail.signedIn));
  displayMenu(document.body.dataset.menuAccess==='member');
  document.querySelectorAll('[data-section-pick]').forEach(link => {
    link.addEventListener('click', () => {
      const select = document.getElementById('mobileMenuSection');
      if ([...select.options].some(option => option.value === link.dataset.sectionPick)) {
        select.value = link.dataset.sectionPick;
        select.dispatchEvent(new Event('change', {bubbles:true}));
      }
    });
  });
}
