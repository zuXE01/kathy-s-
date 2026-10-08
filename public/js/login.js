import { loginForm, loginSubmit, loginMsg, lEmail, lPass, resetPanel } from './elements.js';
import { api } from './api.js';
import { goSignedIn } from './dashboard.js';

export function initLogin() {
  loginForm.addEventListener('submit', handleLogin);
}
function handleLogin(event) {
  event.preventDefault();
  if (loginSubmit.disabled) return;
  resetPanel.classList.remove('show');
  loginMsg.textContent = 'checking with the server…';
  loginMsg.className = 'msg pending';
  loginSubmit.disabled = true;
  clearFieldErrors();
  api('/api/login', { email: lEmail.value.trim(), password: lPass.value }, handleLoginResult);
}
function clearFieldErrors() {
  [lEmail, lPass].forEach(field => {
    field.classList.remove('err');
    field.removeAttribute?.('aria-invalid');
  });
}
function handleLoginResult(error, data) {
  loginSubmit.disabled = false;
  if (error) {
    loginMsg.textContent = error.message;
    loginMsg.className = 'msg bad';
    [lEmail, lPass].forEach(field => {
      field.classList.add('err');
      field.setAttribute?.('aria-invalid', 'true');
    });
    return;
  }
  loginMsg.textContent = 'access granted — welcome back!';
  loginMsg.className = 'msg ok';
  if (data.session) goSignedIn(data.session.user);
}
