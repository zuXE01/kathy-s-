export function initNavigation() {
  document.querySelectorAll('.hub-nav a').forEach(function bindNavigation(link) {
    link.addEventListener('click', handleNavigation);
  });
}
function handleNavigation(event) {
  const link = event.currentTarget;
  document.querySelectorAll('.hub-nav a').forEach(function updateNavigation(item) {
    item.classList.toggle('selected', item === link);
    if (item === link) item.setAttribute('aria-current', 'location');
    else item.removeAttribute('aria-current');
  });
}

