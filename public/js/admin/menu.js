import { request } from './request.js';
import { createMenuCard } from '../menu-card.js';
import { filterMenu, fillSections } from '../menu-filter.js';
import { parseOptions } from '../menu-options.js';
const el = id => document.getElementById(id);
let items = [], removing = null, visible = 12;
export function clearMenu() { items = []; removing = null; el('adminMenuGrid').replaceChildren(); el('itemForm').reset(); }
export function loadMenu() {
  request('/menu', {}, function loaded(error, data) {
    if (error) { el('adminMessage').textContent = error.message; return; }
    items = data.items; fillSections(el('adminSection'),items);
    el('menuSections').replaceChildren();
    [...new Set(items.map(item => item.section || 'House Favorites'))].forEach(section => {
      const option = document.createElement('option'); option.value = section; el('menuSections').append(option);
    });
    renderMenu();
  });
}
function renderMenu() {
  el('adminMenuGrid').replaceChildren();
  const filtered = filterMenu(items,{search:el('menuSearch').value,category:el('menuCategory').value,section:el('adminSection').value});
  el('menuEmpty').hidden = filtered.length !== 0;
  el('adminMenuCount').textContent = 'Showing ' + Math.min(visible,filtered.length) + ' of ' + filtered.length + ' items';
  el('adminMenuMore').hidden = visible >= filtered.length;
  filtered.slice(0,visible).forEach(item => el('adminMenuGrid').append(createMenuCard(item,{onEdit:openEditor,onRemove:confirmRemoval})));
}
function confirmRemoval(item) {
  removing = item.id; el('deletePrompt').textContent = item.name; el('deleteError').textContent = ''; el('deleteDialog').showModal();
}
function updateBasePrice() {
  el('itemPrice').disabled = Boolean(el('itemVariants').value.trim());
  try { const options = parseOptions(el('itemVariants').value); if (options.length) el('itemPrice').value = Math.min(...options.map(option => option.price)); } catch { /* Save displays a validation message. */ }
}
function openEditor(item = {}) {
  el('itemForm').reset();
  el('itemTitle').textContent = item.id ? 'Edit menu item' : 'Add menu item';
  el('itemId').value = item.id || ''; el('itemName').value = item.name || '';
  el('itemDescription').value = item.description || ''; el('itemCategory').value = item.category || 'coffee';
  el('itemPrice').value = item.price ?? ''; el('itemAvailable').checked = item.available ?? true;
  el('itemSection').value = item.section || 'House Favorites';
  el('itemVariants').value = (item.variants || []).map(option => option.label + ' | ' + option.price).join('\n');
  updateBasePrice();
  el('itemError').textContent = ''; el('itemDialog').showModal();
}
function saveItem(event) {
  event.preventDefault();
  if (el('saveItem').disabled) return;
  let variants;
  try { variants = parseOptions(el('itemVariants').value); } catch (error) { el('itemError').textContent = error.message; return; }
  const id = el('itemId').value;
  const item = { name: el('itemName').value, description: el('itemDescription').value, category: el('itemCategory').value, section:el('itemSection').value, variants, price: Number(el('itemPrice').value), available: el('itemAvailable').checked };
  el('saveItem').disabled = el('closeItem').disabled = true;
  request('/menu' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: JSON.stringify(item) }, function saved(error) {
    el('saveItem').disabled = el('closeItem').disabled = false;
    if (error) { el('itemError').textContent = error.message; return; }
    el('itemDialog').close(); el('adminMessage').textContent = 'Menu item saved.'; loadMenu();
  });
}
function deleteItem() {
  el('confirmDelete').disabled = el('cancelDelete').disabled = true;
  request('/menu/' + removing, { method: 'DELETE' }, function removed(error) {
    el('confirmDelete').disabled = el('cancelDelete').disabled = false;
    if (error) { el('deleteError').textContent = error.message; return; }
    el('deleteDialog').close(); removing = null; el('adminMessage').textContent = 'Menu item removed.'; loadMenu();
  });
}
export function initMenuManager() {
  el('addItem').addEventListener('click', () => openEditor());
  function filterChanged() { visible = 12; renderMenu(); }
  el('menuSearch').addEventListener('input', filterChanged); el('menuCategory').addEventListener('change', filterChanged);
  el('adminSection').addEventListener('change',filterChanged);
  el('adminMenuMore').addEventListener('click',function more() { visible += 12; renderMenu(); });
  el('itemVariants').addEventListener('input',updateBasePrice);
  el('itemForm').addEventListener('submit', saveItem); el('closeItem').addEventListener('click', () => el('itemDialog').close());
  el('cancelDelete').addEventListener('click', () => el('deleteDialog').close()); el('confirmDelete').addEventListener('click', deleteItem);
  el('itemDialog').addEventListener('cancel', event => { if (el('saveItem').disabled) event.preventDefault(); });
  el('deleteDialog').addEventListener('cancel', event => { if (el('confirmDelete').disabled) event.preventDefault(); });
}
