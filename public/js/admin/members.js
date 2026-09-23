import { request } from './request.js';
const el = id => document.getElementById(id);
let page = 1;
export function loadMembers(nextPage = 1) {
  el('memberPrev').disabled = el('memberNext').disabled = true;
  el('memberPage').textContent = 'Loading…';
  request('/members?page=' + nextPage, {}, function loaded(error, data) {
    if (error) { el('memberPage').textContent = error.message + ' Reopen Members to retry.'; return; }
    page = data.page;
    el('memberRows').replaceChildren();
    data.items.forEach(function render(member) {
      const row = document.createElement('tr');
      [member.name || 'Hub member', new Date(member.created_at).toLocaleDateString(), member.id].forEach(function cell(value) {
        const td = document.createElement('td'); td.textContent = value; row.append(td);
      });
      el('memberRows').append(row);
    });
    el('memberEmpty').hidden = data.items.length !== 0;
    el('memberPage').textContent = 'Page ' + page + ' · ' + data.total + ' profiles';
    el('memberPrev').disabled = page <= 1;
    el('memberNext').disabled = page * 20 >= data.total;
  });
}
export function initMembers() {
  el('memberPrev').addEventListener('click', () => loadMembers(page - 1));
  el('memberNext').addEventListener('click', () => loadMembers(page + 1));
}
