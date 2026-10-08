import { tabsEl, authCard, lPass, lEmail, statusTag, resetPanel } from './elements.js';
import { showTab } from './tabs.js';
import { forgetCart } from './cart-storage.js';
import { signedInDestination } from './routes.js';
export function goSignedIn(user) {
  lPass.value = '';
  window.location.replace(signedInDestination(window.location.search, user));
}
export function goSignedOut() {
  forgetCart();
  tabsEl.style.display = 'flex'; authCard.hidden = false;
  document.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
  resetPanel.classList.remove('show'); statusTag.textContent = 'not signed in';
  showTab('login'); lEmail.focus();
}
