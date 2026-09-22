export function initMenu() {
  document.querySelectorAll('[data-filter]').forEach(function bindFilter(button) {
    button.addEventListener('click', handleFilter);
  });
}
function handleFilter(event) {
  const button = event.currentTarget;
  document.querySelectorAll('[data-filter]').forEach(function updateFilter(filter) {
    filter.classList.toggle('active', filter === button);
    filter.setAttribute('aria-pressed', String(filter === button));
  });
  let count = 0;
  document.querySelectorAll('[data-category]').forEach(function updateCard(card) {
    card.hidden = button.dataset.filter !== 'all' && card.dataset.category !== button.dataset.filter;
    if (!card.hidden) count++;
  });
  document.getElementById('menuResult').textContent = count + ' sample menu ' + (count === 1 ? 'item' : 'items') + ' shown.';
}

