import { getOptions } from './menu-card.js';
export function filterMenu(items, { search = '', category = 'all', section = 'all', sort = 'name' } = {}) {
  const term = search.trim().toLocaleLowerCase();
  const result = items.filter(item => (category === 'all' || item.category === category) && (section === 'all' || (item.section || 'House Favorites') === section) &&
    [item.name,item.section,item.description].join(' ').toLocaleLowerCase().includes(term));
  const minimum = item => Math.min(...getOptions(item).map(option => Number(option.price)));
  return result.sort((a,b) => (sort === 'price-low' ? minimum(a)-minimum(b) : sort === 'price-high' ? minimum(b)-minimum(a) : 0) || a.name.localeCompare(b.name) || (a.section || '').localeCompare(b.section || ''));
}
export function fillSections(select, items) {
  const selected = select.value; select.replaceChildren();
  ['all',...new Set(items.map(item => item.section || 'House Favorites').sort())].forEach(section => {
    const option = document.createElement('option'); option.value = section; option.textContent = section === 'all' ? 'All sections' : section; select.append(option);
  });
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}
