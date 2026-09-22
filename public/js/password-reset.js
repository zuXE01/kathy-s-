import { forgotLink, resetPanel, resetEmail, newPass, cancelReset, confirmReset, loginMsg, lEmail, lPass } from './elements.js';
import { api } from './api.js';

export function initPasswordReset() {
  forgotLink.addEventListener('click', openReset);
  cancelReset.addEventListener('click', closeReset);
  confirmReset.addEventListener('click', handleReset);
}
function openReset(event) {
  event.preventDefault();
  resetPanel.classList.add('show');
  resetEmail.value = lEmail.value.trim();
  newPass.focus();
}
function closeReset() {
  resetPanel.classList.remove('show');
  loginMsg.textContent = '';
  loginMsg.className = 'msg';
}
function handleReset() {
  if (confirmReset.disabled) return;
  const email = resetEmail.value.trim();
  resetEmail.classList.remove('err');
  newPass.classList.remove('err');
  if (!email) { resetEmail.classList.add('err'); return; }
  if (!newPass.value) { newPass.classList.add('err'); return; }
  confirmReset.disabled = true;
  loginMsg.textContent = 'updating the database…';
  loginMsg.className = 'msg pending';
  api('/api/reset-password', { email, newPassword: newPass.value }, function handleResetResult(error) {
    confirmReset.disabled = false;
    if (error) {
      resetEmail.classList.add('err');
      loginMsg.textContent = error.message;
      loginMsg.className = 'msg bad';
      return;
    }
    resetPanel.classList.remove('show');
    newPass.value = '';
    lEmail.value = email;
    lPass.value = '';
    loginMsg.textContent = 'password reset — please sign in with your new password.';
    loginMsg.className = 'msg ok';
    lPass.focus();
  });
}

