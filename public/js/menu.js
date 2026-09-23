import { createMenuCard } from './menu-card.js';
import { filterMenu, fillSections } from './menu-filter.js';
const el = id => document.getElementById(id);
let items = [], category = 'all', visible = 12;
function render() {
  const matches = filterMenu(items,{ category, section:el('catalogSection').value, search:el('catalogSearch').value, sort:el('catalogSort').value });
  const grid = el('catalogGrid'); grid.replaceChildren();
  matches.slice(0,visible).forEach(item => grid.append(createMenuCard(item)));
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
    items = data.items; fillSections(el('catalogSection'),items); render();
  }).catch(function failed() {
    el('menuResult').textContent = 'We could not load the menu. Please try again.'; el('catalogRetry').hidden = false;
  }).finally(() => el('catalogGrid').setAttribute('aria-busy','false'));
}
export function initMenu() {
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click',function filterCategory() {
    category = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(filter => { filter.classList.toggle('active',filter===button); filter.setAttribute('aria-pressed',String(filter===button)); });
    filtersChanged();
  }));
  el('catalogSearch').addEventListener('input',filtersChanged);
  el('catalogSection').addEventListener('change',filtersChanged); el('catalogSort').addEventListener('change',filtersChanged);
  el('catalogMore').addEventListener('click',function more() { visible += 12; render(); });
  el('catalogRetry').addEventListener('click',loadMenu);
  loadMenu();
}
