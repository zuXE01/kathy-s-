import { request } from './request.js';
const el = id => document.getElementById(id);
let items = [], removing = null;
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
export function clearMenu() { items = []; removing = null; el('adminMenuGrid').replaceChildren(); el('itemForm').reset(); }
export function loadMenu() {
  request('/menu', {}, function loaded(error, data) {
    if (error) { el('adminMessage').textContent = error.message; return; }
    items = data.items; renderMenu();
  });
}
function renderMenu() {
  el('adminMenuGrid').replaceChildren();
  const search = el('menuSearch').value.toLowerCase();
  const category = el('menuCategory').value;
  const filtered = items.filter(item => item.name.toLowerCase().includes(search) && (category === 'all' || category === item.category));
  el('menuEmpty').hidden = filtered.length !== 0;
  filtered.forEach(function card(item) {
    const article = document.createElement('article'); article.className = 'admin-menu-card';
    [['small', item.category + ' · ' + (item.available ? 'Available' : 'Hidden')], ['h2', item.name], ['p', item.description], ['strong', money.format(item.price)]].forEach(function field([tag, value]) {
      const node = document.createElement(tag); node.textContent = value; article.append(node);
    });
    const actions = document.createElement('div'); actions.className = 'admin-form-row';
    const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.className = 'admin-button secondary'; edit.addEventListener('click', () => openEditor(item));
    const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.className = 'admin-button secondary'; remove.addEventListener('click', function confirm() {
      removing = item.id; el('deletePrompt').textContent = item.name; el('deleteError').textContent = ''; el('deleteDialog').showModal();
    });
    actions.append(edit, remove); article.append(actions); el('adminMenuGrid').append(article);
  });
}
function openEditor(item = {}) {
  el('itemForm').reset();
  el('itemTitle').textContent = item.id ? 'Edit menu item' : 'Add menu item';
  el('itemId').value = item.id || ''; el('itemName').value = item.name || '';
  el('itemDescription').value = item.description || ''; el('itemCategory').value = item.category || 'coffee';
  el('itemPrice').value = item.price ?? ''; el('itemAvailable').checked = item.available ?? true;
  el('itemError').textContent = ''; el('itemDialog').showModal();
}
function saveItem(event) {
  event.preventDefault();
  const id = el('itemId').value;
  const item = { name: el('itemName').value, description: el('itemDescription').value, category: el('itemCategory').value, price: Number(el('itemPrice').value), available: el('itemAvailable').checked };
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
  el('menuSearch').addEventListener('input', renderMenu); el('menuCategory').addEventListener('change', renderMenu);
  el('itemForm').addEventListener('submit', saveItem); el('closeItem').addEventListener('click', () => el('itemDialog').close());
  el('cancelDelete').addEventListener('click', () => el('deleteDialog').close()); el('confirmDelete').addEventListener('click', deleteItem);
  el('itemDialog').addEventListener('cancel', event => { if (el('saveItem').disabled) event.preventDefault(); });
  el('deleteDialog').addEventListener('cancel', event => { if (el('confirmDelete').disabled) event.preventDefault(); });
}
