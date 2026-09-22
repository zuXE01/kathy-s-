import { forgotLink, resetPanel, resetEmail, newPass, cancelReset, confirmReset, loginMsg, lEmail } from './elements.js';
import { authAction } from './auth-client.js';
import { goSignedOut } from './dashboard.js';

let recovering = false;
export function isRecovering() { return recovering; }

export function initPasswordReset() {
  forgotLink.addEventListener('click', openReset);
  cancelReset.addEventListener('click', closeReset);
  confirmReset.addEventListener('click', handleReset);
}
function configurePanel(recovery) {
  recovering = recovery;
  resetPanel.classList.add('show');
  resetEmail.closest('.field').hidden = recovery;
  newPass.closest('.field').hidden = !recovery;
  document.getElementById('resetConfirmField').hidden = !recovery;
  confirmReset.textContent = recovery ? 'Save new password' : 'Send recovery email';
  document.getElementById('resetHelp').textContent = recovery
    ? 'Choose a new password with at least 12 characters.'
    : 'We will email a secure recovery link. Open it to choose a new password.';
}
export function openRecovery() {
  goSignedOut();
  configurePanel(true);
  newPass.focus();
}
function openReset(event) {
  event.preventDefault();
  configurePanel(false);
  resetEmail.value = lEmail.value.trim();
  resetEmail.focus();
}
function closeReset() {
  if (recovering) {
    authAction(client => client.auth.signOut(), function signedOut(error) {
      if (error) { showMessage(error.message, 'bad'); return; }
      finishRecovery();
      goSignedOut();
    });
    return;
  }
  resetPanel.classList.remove('show');
}
function finishRecovery() {
  recovering = false;
  sessionStorage.removeItem('hub-recovery');
  newPass.value = '';
  document.getElementById('resetConfirm').value = '';
  resetPanel.classList.remove('show');
}
function showMessage(message, state) {
  loginMsg.textContent = message;
  loginMsg.className = 'msg ' + state;
}
function handleReset() {
  if (confirmReset.disabled) return;
  if (!recovering && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.value.trim())) {
    showMessage('Enter a valid email address.', 'bad'); return;
  }
  if (recovering && (newPass.value.length < 12 || newPass.value !== document.getElementById('resetConfirm').value)) {
    showMessage('Use at least 12 characters and make both passwords match.', 'bad'); return;
  }
  confirmReset.disabled = true;
  showMessage(recovering ? 'Saving your password…' : 'Requesting a recovery email…', 'pending');
  if (!recovering) {
    authAction(client => client.auth.resetPasswordForEmail(resetEmail.value.trim(), {
      redirectTo: window.location.origin + '/'
    }), function emailRequested(error) {
      confirmReset.disabled = false;
      showMessage(error ? 'Unable to send recovery email. Please try again later or contact the site owner.'
        : 'If that account can receive email, a recovery link is on its way. Check your inbox and spam folder.', error ? 'bad' : 'ok');
    });
    return;
  }
  authAction(client => client.auth.updateUser({ password: newPass.value }), function passwordUpdated(error) {
    confirmReset.disabled = false;
    if (error) { showMessage(error.message, 'bad'); return; }
    authAction(client => client.auth.signOut(), function signedOut(signOutError) {
      if (signOutError) {
        showMessage('Password saved, but sign-out failed. Please try Cancel to sign out.', 'bad'); return;
      }
      finishRecovery();
      goSignedOut();
      showMessage('Password updated. Please sign in with your new password.', 'ok');
    });
  });
}
