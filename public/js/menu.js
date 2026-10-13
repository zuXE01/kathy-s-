import { createMenuCard } from './menu-card.js';
import { initCart, addToCart } from './cart.js';
import { showSkeleton } from './loading.js';
import { filterMenu, getSections, fillSections, menuGroups, sectionGroup } from './menu-filter.js';
const el = id => document.getElementById(id);
let items = [], section = 'all', visible = 12, loading = false, canOrder = true;
let group = 'all';
const selections = new Map();
function renderSections() {
  const groupItems=group==='all'?items:items.filter(item=>item.category===group);
  fillSections(el('mobileMenuSection'), groupItems);
  el('mobileMenuSection').value = section;
  const filters = el('catalogFilters');
  if(!filters.querySelector('[data-group]'))menuGroups.forEach(({value,label}) => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.group = value;
    button.textContent = label;
    filters.append(button);
  });
  filters.querySelectorAll('[data-group]').forEach(button=>{
    button.classList.toggle('active',button.dataset.group===group);
    button.setAttribute('aria-pressed',String(button.dataset.group===group));
  });
  const label=menuGroups.find(item=>item.value===group).label;
  el('catalogSearchLabel').textContent=group==='all'?'Search the full menu':'Search '+label.toLowerCase();
  el('catalogSearch').placeholder=group==='all'?'Search all menu items…':'Search '+label.toLowerCase()+'…';
  el('catalogSearch').setAttribute('aria-label',el('catalogSearchLabel').textContent);
}
function render() {
  if (loading) return;
  const matches = filterMenu(items,{ category:group, section, search:el('catalogSearch').value });
  const grid = el('catalogGrid'); grid.replaceChildren();
  matches.slice(0,visible).forEach(item => grid.append(createMenuCard(item,{
    onAdd:canOrder ? addToCart : undefined,
    selectedLabel:selections.get(item.id),
    onOptionChange:label=>selections.set(item.id,label)
  })));
  el('catalogMore').hidden = matches.length <= visible;
  el('catalogEmpty').hidden = matches.length > 0;
  el('catalogClear').hidden=matches.length>0||(!el('catalogSearch').value&&group==='all'&&section==='all');
  const scope=section!=='all'?' in '+section:group==='all'?' across the full menu':' in '+menuGroups.find(item=>item.value===group).label.toLowerCase();
  el('catalogEmpty').textContent=items.length===0?'Please check again later.':'Change your search or choose Clear filters to browse the full menu.';
  el('menuResult').textContent = matches.length ? 'Showing ' + Math.min(visible,matches.length) + ' of ' + matches.length + (matches.length===1?' item':' items')+scope : items.length===0?'No menu items are available right now.':'No matching items'+scope+'.';
}
function filtersChanged() { visible = 12; render(); }
function loadMenu() {
  if (loading) return;
  loading = true;
  const finishLoading = showSkeleton(el('catalogGrid'),4);
  el('catalogMore').hidden = el('catalogEmpty').hidden = true;
  el('catalogRetry').hidden = true; el('catalogGrid').setAttribute('aria-busy','true');
  el('menuResult').textContent = 'Loading the menu…';
  fetch('/api/menu').then(function checked(response) {
    if (!response.ok) throw new Error('Menu unavailable'); return response.json();
  }).then(function loaded(data) {
    if (!Array.isArray(data.items)) throw new Error('Invalid menu response');
    items = data.items;
    if (section !== 'all' && !getSections(items).includes(section)) section = 'all';
    if(section!=='all')group=sectionGroup(items,section);
    loading = false; renderSections(); render();
  }).catch(function failed() {
    el('menuResult').textContent = 'The menu could not be loaded. Choose Retry loading menu to try again.'; el('catalogRetry').hidden = false;
  }).finally(() => { loading = false; finishLoading(); });
}
export function initMenu(initialSection = 'all', options = {}) {
  section = initialSection;
  group = 'all';
  canOrder = options.canOrder !== false;
  initCart();
  el('catalogFilters').addEventListener('click',function filterSection(event) {
    const button = event.target.closest('button[data-group]');
    if (!button) return;
    if(!menuGroups.some(item=>item.value===button.dataset.group))return;
    group = button.dataset.group;section='all';
    renderSections();
    filtersChanged();
  });
  el('mobileMenuSection').addEventListener('change',function selectMobileSection() {
    section = this.value;
    renderSections(); filtersChanged();
  });
  let searchTimer;
  el('catalogClear').addEventListener('click',()=>{
    clearTimeout(searchTimer);group='all';section='all';el('catalogSearch').value='';
    renderSections();filtersChanged();el('catalogSearch').focus();
  });
  el('catalogSearch').addEventListener('input',function() { clearTimeout(searchTimer); searchTimer = setTimeout(filtersChanged, 250); });
  el('catalogMore').addEventListener('click',function more() { visible += 12; render(); });
  el('catalogRetry').addEventListener('click',loadMenu);
  loadMenu();
}
export function setMenuOrderAccess(value) {
  const nextCanOrder = value === true;
  if (canOrder === nextCanOrder) return;
  canOrder = nextCanOrder;
  render();
}
