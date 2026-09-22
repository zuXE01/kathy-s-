import { rName, rDob, rGender, rEmail, rPass, rConfirm, registerForm, registerSubmit, registerMsg, continuePanel, yesContinue, noContinue, lEmail, lPass, loginMsg } from './elements.js';
import { api } from './api.js';
import { showTab } from './tabs.js';

let redirectTimer;
let cancelTimer;

export function initRegister() {
  registerForm.addEventListener('submit', handleRegister);
  yesContinue.addEventListener('click', retryPassword);
  noContinue.addEventListener('click', cancelRegistration);
}
function clearRegErr() {
  [rName, rDob, rGender, rEmail, rPass, rConfirm].forEach(function clearFieldError(field) {
    field.classList.remove('err');
  });
}
function handleRegister(event) {
  event.preventDefault();
  if (registerSubmit.disabled) return;
  clearTimeout(cancelTimer);
  continuePanel.classList.remove('show');
  clearRegErr();
  const fields = [rName, rDob, rGender, rEmail, rPass, rConfirm];
  const missing = fields.filter(function isMissing(field) { return !field.value; });
  if (missing.length) {
    missing.forEach(function markMissing(field) { field.classList.add('err'); });
    registerMsg.textContent = 'please fill out every field first.';
    registerMsg.className = 'msg bad';
    return;
  }
  if (rPass.value !== rConfirm.value) {
    registerMsg.textContent = 'password and confirm password do not match.';
    registerMsg.className = 'msg bad';
    rPass.classList.add('err');
    rConfirm.classList.add('err');
    continuePanel.classList.add('show');
    return;
  }
  registerSubmit.disabled = true;
  registerMsg.textContent = 'creating your account on the server…';
  registerMsg.className = 'msg pending';
  api('/api/register', {
    email: rEmail.value.trim(),
    password: rPass.value,
    confirm: rConfirm.value,
    name: rName.value.trim(),
    dob: rDob.value,
    gender: rGender.value
  }, handleRegisterResult);
}
function handleRegisterResult(error, data) {
  if (error) {
    registerSubmit.disabled = false;
    if (/already exists/i.test(error.message)) rEmail.classList.add('err');
    registerMsg.textContent = error.message;
    registerMsg.className = 'msg bad';
    return;
  }
  registerMsg.textContent = 'welcome to the Hub! redirecting to sign in…';
  registerMsg.className = 'msg ok';
  clearTimeout(redirectTimer);
  redirectTimer = setTimeout(function returnToLogin() {
    registerForm.reset();
    registerSubmit.disabled = false;
    showTab('login');
    lEmail.value = data.email;
    lPass.value = '';
    lPass.focus();
    loginMsg.textContent = 'account created — please sign in.';
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
  registerMsg.textContent = 're-enter your password and confirmation, then submit again.';
  registerMsg.className = 'msg pending';
  rPass.focus();
}
function cancelRegistration() {
  continuePanel.classList.remove('show');
  registerMsg.textContent = 'registration cancelled.';
  registerMsg.className = 'msg bad';
  clearTimeout(cancelTimer);
  cancelTimer = setTimeout(function clearRegistration() {
    registerForm.reset();
    clearRegErr();
    registerMsg.textContent = '';
    registerMsg.className = 'msg';
  }, 1200);
}

