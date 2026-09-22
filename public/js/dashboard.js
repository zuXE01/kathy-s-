import { tabsEl, loginView, registerView, authCard, signedInView, lPass, lEmail, statusTag, resetPanel } from './elements.js';
import { showTab } from './tabs.js';
import { authAction } from './auth-client.js';
export function goSignedIn(email, name){
    tabsEl.style.display = 'none';
    loginView.classList.remove('active');
    registerView.classList.remove('active');
    authCard.hidden = true;
    signedInView.hidden = false;
    document.body.classList.add('dashboard-open');
    const displayName = (name || '').trim() || email;
    document.getElementById('signedInName').textContent = 'Welcome back, ' + displayName + '.';
    document.getElementById('memberName').textContent = displayName;
    document.getElementById('memberInitial').textContent = Array.from(displayName)[0].toUpperCase();
    document.getElementById('accountName').textContent = name || 'Hub member';
    document.getElementById('accountEmail').textContent = email;
    lPass.value = '';
    document.title = "Your Hub — Kathy's Hub";
    statusTag.textContent = 'signed in as ' + email;
    window.scrollTo(0, 0);
    document.getElementById('signedInName').focus({ preventScroll: true });
  }
  export function goSignedOut(){
    tabsEl.style.display = 'flex';
    signedInView.hidden = true;
    authCard.hidden = false;
    document.body.classList.remove('dashboard-open');
    document.title = "Kathy's Hub — Sign in";
    ['accountName', 'accountEmail', 'memberName', 'memberInitial', 'signedInName'].forEach(id => {
      document.getElementById(id).textContent = '';
    });
    document.querySelectorAll('input[type="password"]').forEach(input => { input.value = ''; });
    document.querySelector('[data-filter="all"]').click();
    resetPanel.classList.remove('show');
    statusTag.textContent = 'not signed in';
    showTab('login');
    lEmail.focus();
  }

export function initDashboard() {
  document.getElementById('signOutBtn').addEventListener('click', handleSignOut);
}

function handleSignOut() {
  const button = document.getElementById('signOutBtn');
  button.disabled = true;
  authAction(client => client.auth.signOut(), function signedOut(error) {
    button.disabled = false;
    if (error) {
      document.getElementById('signOutMessage').textContent = 'Sign-out failed. Check your connection and try again.';
      return;
    }
    document.getElementById('signOutMessage').textContent = '';
    sessionStorage.removeItem('hub-recovery');
    goSignedOut();
  });
}
