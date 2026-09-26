import { getAuthClient } from '../auth-client.js';
import { request, cancelRequests } from './request.js';
import { initMembers, loadMembers } from './members.js';
import { initMenuManager, loadMenu, clearMenu } from './menu.js';
import { initOrders, loadOrders, clearOrders } from './orders.js';
const el = id => document.getElementById(id);
let managementAccess=false;
function deny(message) {
  managementAccess=false;
  clearOrders();
  cancelRequests(); el('adminShell').hidden = true; el('adminGate').hidden = false;
  el('gateMessage').textContent = message; el('memberRows').replaceChildren(); clearMenu();
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  ['memberCount', 'menuCount', 'availableCount', 'adminIdentity'].forEach(id => { el(id).textContent = ''; });
}
function overview() {
  el('refreshOverview').disabled = true;
  request('/overview', {}, function loaded(error, data) {
    el('refreshOverview').disabled = false;
    if (error) { if (el('adminShell').hidden) el('gateMessage').textContent = error.message; else el('adminMessage').textContent = error.message; return; }
    const management=['owner','platform_admin'].includes(data.role);
    managementAccess=management;
    document.querySelectorAll('[data-section="members"],[data-section="menu"],[data-open-menu]').forEach(control=>{control.hidden=!management;});
    document.querySelector('.admin-feature').hidden=!management;
    const metrics=management
      ? [['Member profiles',data.members,'Registered member profiles'],['Menu items',data.menu,'Full saved catalog'],['Available items',data.available,'Visible on the menu']]
      : [['Accepted orders',data.orderCounts.accepted,'Waiting for preparation'],['Preparing orders',data.orderCounts.preparing,'Currently in the kitchen'],['Ready orders',data.orderCounts.ready,'Ready for the next step']];
    ['memberCount','menuCount','availableCount'].forEach((id,index)=>{
      const counter=el(id),card=counter.closest('article');counter.textContent=metrics[index][1];
      card.querySelector('span').textContent=metrics[index][0];card.querySelector('small').textContent=metrics[index][2];
    });
    el('adminGate').hidden = true; el('adminShell').hidden = false;
    document.querySelector('.admin-badge').textContent=data.role.replaceAll('_',' ').toUpperCase();
    el('adminIdentity').textContent = 'Signed in as ' + data.email + ' · ' + data.role.replaceAll('_',' ');
  });
}
function navigate(section) {
  if(['members','menu'].includes(section)&&!managementAccess)return;
  document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== section; });
  document.querySelectorAll('[data-section]').forEach(button => {
    const selected = button.dataset.section === section; button.classList.toggle('selected', selected);
    if (selected) { button.setAttribute('aria-current', 'page'); el('sectionLabel').textContent = button.firstChild.textContent.trim(); }
    else button.removeAttribute('aria-current');
  });
  el('adminMessage').textContent = '';
  if (section === 'overview') overview();
  if (section === 'members') loadMembers();
  if (section === 'menu') loadMenu();
  if (section === 'orders') loadOrders();
}
initMembers(); initMenuManager(); initOrders();
document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.section)));
document.querySelector('[data-open-menu]').addEventListener('click', () => navigate('menu'));
el('refreshOverview').addEventListener('click', overview);
window.addEventListener('admin-denied', event => deny(event.detail));
el('adminLogout').addEventListener('click', function signOut() {
  el('adminLogout').disabled = true;
  getAuthClient().then(client => client.auth.signOut()).then(function done(result) {
    if (result.error) throw result.error;
    deny('You are signed out.');
  }).catch(() => { el('adminMessage').textContent = 'Unable to sign out. Please try again.'; }).finally(() => { el('adminLogout').disabled = false; });
});
getAuthClient().then(function watch(client) {
  let identity;
  client.auth.onAuthStateChange(function changed(event,session) {
    const next=session?session.user.id+':'+session.user.app_metadata?.hub_role:null;
    if (event === 'SIGNED_OUT'||!session) {identity=null;deny('Please sign in with your staff account.');return;}
    if(next!==identity){identity=next;deny('Checking your permissions…');setTimeout(()=>{if(identity===next)navigate('overview');},0);}
  });
}).catch(() => deny('Unable to connect. Please reload and try again.'));
