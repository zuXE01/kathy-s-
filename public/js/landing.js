import { initMenu } from './menu.js';
// Preserve previously issued confirmation and recovery links at the public root.
const hash = new URLSearchParams(location.hash.slice(1));
const query = new URLSearchParams(location.search);
if (hash.has('access_token') || hash.has('error') || query.has('code')) {
  location.replace('/signin.html' + location.search + location.hash);
} else {
  initMenu();
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
