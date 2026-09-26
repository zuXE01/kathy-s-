import { tabsEl, authCard, lPass, lEmail, statusTag, resetPanel } from './elements.js';
import { showTab } from './tabs.js';
import { forgetCart } from './cart-storage.js';
import { returnDestination } from './routes.js';
export function goSignedIn() {
  lPass.value = '';
  window.location.replace(returnDestination(window.location.search));
}
export function goSignedOut() {
  forgetCart();
  tabsEl.style.display = 'flex'; authCard.hidden = false;
  document.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
  resetPanel.classList.remove('show'); statusTag.textContent = 'not signed in';
  showTab('login'); lEmail.focus();
}
