export function initMenu() {
  document.querySelectorAll('[data-filter]').forEach(function bindFilter(button) {
    button.addEventListener('click', handleFilter);
  });
  fetch('/api/menu').then(function check(response) {
    if (!response.ok) throw new Error('Menu unavailable');
    return response.json();
  }).then(renderSavedMenu).catch(function unavailable() {
    document.querySelector('.section-description').textContent = 'The saved menu is temporarily unavailable. Illustrative samples are shown below.';
  });
}
function renderSavedMenu(data) {
  const grid = document.querySelector('.menu-grid');
  grid.replaceChildren();
  document.querySelector('.preview-tag').textContent = 'Demo catalog';
  document.querySelector('.section-description').textContent = data.items.length ? 'Our latest menu. Online ordering is coming soon.' : 'Our menu is being prepared. Check back soon.';
  const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
  data.items.forEach(function render(item) {
    const card = document.createElement('article'); card.className = 'menu-card'; card.dataset.category = item.category;
    const art = document.createElement('div'); art.className = 'menu-illustration ' + ({coffee:'latte-art',bites:'toast-art',sweet:'cake-art'}[item.category] || 'latte-art'); art.setAttribute('aria-hidden', 'true');
    const icon = document.createElement('span'); icon.textContent = {coffee:'☕',bites:'🥪',sweet:'🍰'}[item.category] || '☕'; art.append(icon);
    const copy = document.createElement('div'); copy.className = 'menu-card-copy';
    [['span', item.category.toUpperCase()], ['h3', item.name], ['p', item.description], ['strong', money.format(item.price)]].forEach(function field([tag, value]) {
      const node = document.createElement(tag); node.textContent = value; copy.append(node);
    });
    card.append(art, copy); grid.append(card);
  });
  document.querySelector('[data-filter].active').click();
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
  document.getElementById('menuResult').textContent = count + ' menu ' + (count === 1 ? 'item' : 'items') + ' shown.';
}
