import { createMenuCard } from './menu-card.js';
import { initCart, addToCart } from './cart.js';
import { filterMenu, getSections, fillSections } from './menu-filter.js';
const el = id => document.getElementById(id);
let items = [], section = 'all', visible = 12;
function renderSections() {
  fillSections(el('mobileMenuSection'), items);
  el('mobileMenuSection').value = section;
  const filters = el('catalogFilters'); filters.replaceChildren();
  ['all', ...getSections(items)].forEach(value => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.filter = value;
    button.textContent = value === 'all' ? 'All menu' : value;
    button.classList.toggle('active', value === section);
    button.setAttribute('aria-pressed', String(value === section));
    filters.append(button);
  });
}
function render() {
  const matches = filterMenu(items,{ section, search:el('catalogSearch').value });
  const grid = el('catalogGrid'); grid.replaceChildren();
  matches.slice(0,visible).forEach(item => grid.append(createMenuCard(item,{onAdd:addToCart})));
  el('catalogMore').hidden = matches.length <= visible;
  el('catalogEmpty').hidden = matches.length > 0;
  el('menuResult').textContent = matches.length ? 'Showing ' + Math.min(visible,matches.length) + ' of ' + matches.length + ' items' : 'No matching items. Try a different search or section.';
}
function filtersChanged() { visible = 12; render(); }
function loadMenu() {
  el('catalogRetry').hidden = true; el('catalogGrid').setAttribute('aria-busy','true');
  el('menuResult').textContent = 'Loading the menu…';
  fetch('/api/menu').then(function checked(response) {
    if (!response.ok) throw new Error('Menu unavailable'); return response.json();
  }).then(function loaded(data) {
    items = data.items; renderSections(); render();
  }).catch(function failed() {
    el('menuResult').textContent = 'We could not load the menu. Please try again.'; el('catalogRetry').hidden = false;
  }).finally(() => el('catalogGrid').setAttribute('aria-busy','false'));
}
export function initMenu() {
  initCart();
  el('catalogFilters').addEventListener('click',function filterSection(event) {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    section = button.dataset.filter;
    el('mobileMenuSection').value = section;
    el('catalogFilters').querySelectorAll('[data-filter]').forEach(filter => { filter.classList.toggle('active',filter===button); filter.setAttribute('aria-pressed',String(filter===button)); });
    filtersChanged();
  });
  el('mobileMenuSection').addEventListener('change',function selectMobileSection() {
    section = this.value;
    renderSections(); filtersChanged();
  });
  el('catalogSearch').addEventListener('input',filtersChanged);
  el('catalogMore').addEventListener('click',function more() { visible += 12; render(); });
  el('catalogRetry').addEventListener('click',loadMenu);
  loadMenu();
}
