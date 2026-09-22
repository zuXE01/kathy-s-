import { getAuthClient } from './auth-client.js';
import { goSignedIn, goSignedOut } from './dashboard.js';
import { openRecovery, isRecovering } from './password-reset.js';
import { loginMsg } from './elements.js';

export function initSession() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.has('error')) {
    loginMsg.textContent = 'This email link has expired or is invalid. Request a new link.';
    loginMsg.className = 'msg bad';
    history.replaceState(null, '', window.location.pathname);
  }
  getAuthClient().then(function subscribe(client) {
    let revision = 0;
    client.auth.onAuthStateChange(function authChanged(event, session) {
      const current = ++revision;
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('hub-recovery', session.user.id);
        openRecovery();
        return;
      }
      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem('hub-recovery');
        goSignedOut();
        return;
      }
      if (!session || isRecovering()) return;
      // Defer SDK calls until the state-change callback releases its auth lock.
      setTimeout(function verifySession() {
        client.auth.getUser().then(function verified(result) {
          if (current !== revision) return;
          if (result.error || !result.data.user) {
            goSignedOut();
            loginMsg.textContent = 'Unable to verify your session. Please sign in again.';
            loginMsg.className = 'msg bad';
            return;
          }
          const user = result.data.user;
          if (sessionStorage.getItem('hub-recovery') === user.id) {
            openRecovery();
          } else {
            goSignedIn(user.email, user.user_metadata?.name || '');
          }
        }).catch(function failed() {
          if (current !== revision) return;
          goSignedOut();
          loginMsg.textContent = 'Unable to verify your session. Check your connection.';
          loginMsg.className = 'msg bad';
        });
      }, 0);
    });
  }).catch(function unavailable(error) {
    loginMsg.textContent = error.message;
    loginMsg.className = 'msg bad';
  });
}
