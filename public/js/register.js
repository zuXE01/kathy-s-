import { rName, rEmail, rPass, rConfirm, registerForm, registerSubmit, registerMsg, continuePanel, yesContinue, noContinue, lEmail, lPass, loginMsg } from './elements.js';
import { api } from './api.js';
import { showTab } from './tabs.js';
import { goSignedIn } from './dashboard.js';

let redirectTimer;
let cancelTimer;

export function initRegister() {
  registerForm.addEventListener('submit', handleRegister);
  yesContinue.addEventListener('click', retryPassword);
  noContinue.addEventListener('click', cancelRegistration);
}
function clearRegErr() {
  [rName, rEmail, rPass, rConfirm].forEach(function clearFieldError(field) {
    field.classList.remove('err');
    field.removeAttribute?.('aria-invalid');
  });
}
function markRegErr(field) {
  field.classList.add('err');
  field.setAttribute?.('aria-invalid', 'true');
}
function handleRegister(event) {
  event.preventDefault();
  if (registerSubmit.disabled) return;
  clearTimeout(cancelTimer);
  continuePanel.classList.remove('show');
  clearRegErr();
  const fields = [rName, rEmail, rPass, rConfirm];
  const missing = fields.filter(function isMissing(field) { return !field.value.trim(); });
  if (missing.length) {
    missing.forEach(markRegErr);
    registerMsg.textContent = 'Enter your name, email, password and password confirmation.';
    registerMsg.className = 'msg bad';
    missing[0].focus();
    return;
  }
  if (rPass.value !== rConfirm.value) {
    registerMsg.textContent = 'The passwords do not match. Correct either field, or choose Re-enter passwords to clear both.';
    registerMsg.className = 'msg bad';
    markRegErr(rPass);
    markRegErr(rConfirm);
    continuePanel.classList.add('show');
    return;
  }
  registerSubmit.disabled = true;
  if (rPass.value.length < 12) {
    registerSubmit.disabled = false;
    registerMsg.textContent = 'Please use a password with at least 12 characters.';
    registerMsg.className = 'msg bad';
    markRegErr(rPass);
    rPass.focus();
    return;
  }
  registerMsg.textContent = 'Creating your account…';
  registerMsg.className = 'msg pending';
  api('/api/register', {
    email: rEmail.value.trim(),
    password: rPass.value,
    confirm: rConfirm.value,
    name: rName.value.trim()
  }, handleRegisterResult);
}
function handleRegisterResult(error, data) {
  if (error) {
    registerSubmit.disabled = false;
    if (/already exists/i.test(error.message)) markRegErr(rEmail);
    registerMsg.textContent = error.message;
    registerMsg.className = 'msg bad';
    return;
  }
  if (data.session) {
    clearTimeout(redirectTimer);
    clearTimeout(cancelTimer);
    registerForm.reset();
    registerSubmit.disabled = false;
    registerMsg.textContent = '';
    goSignedIn(data.session.user);
    return;
  }
  // Retain the fallback if confirmation is re-enabled in Supabase later.
  registerMsg.textContent = 'Check your email to confirm your account before signing in.';
  registerMsg.className = 'msg ok';
  clearTimeout(redirectTimer);
  redirectTimer = setTimeout(function returnToLogin() {
    registerForm.reset();
    registerSubmit.disabled = false;
    showTab('login');
    lEmail.value = data.email;
    lPass.value = '';
    lPass.focus();
    loginMsg.textContent = 'Check your email for a confirmation link before signing in. If you already have an account, sign in or request a password reset.';
    loginMsg.className = 'msg ok';
  }, 900);
}
function retryPassword() {
  clearTimeout(cancelTimer);
  continuePanel.classList.remove('show');
  rPass.value = '';
  rConfirm.value = '';
  rPass.classList.remove('err');
  rConfirm.classList.remove('err');
  rPass.removeAttribute?.('aria-invalid');
  rConfirm.removeAttribute?.('aria-invalid');
  registerMsg.textContent = 'Enter the same password in both fields, then choose Create account.';
  registerMsg.className = 'msg pending';
  rPass.focus();
}
function cancelRegistration() {
  continuePanel.classList.remove('show');
  registerMsg.textContent = 'Registration cancelled. Your form will be cleared.';
  registerMsg.className = 'msg bad';
  clearTimeout(cancelTimer);
  cancelTimer = setTimeout(function clearRegistration() {
    registerForm.reset();
    clearRegErr();
    registerMsg.textContent = '';
    registerMsg.className = 'msg';
  }, 1200);
}
