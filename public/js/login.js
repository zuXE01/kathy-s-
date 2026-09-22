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
  lEmail.classList.remove('err');
  lPass.classList.remove('err');
  api('/api/login', { email: lEmail.value.trim(), password: lPass.value }, handleLoginResult);
}
function handleLoginResult(error, data) {
  loginSubmit.disabled = false;
  if (error) {
    loginMsg.textContent = error.message;
    loginMsg.className = 'msg bad';
    lEmail.classList.add('err');
    lPass.classList.add('err');
    return;
  }
  loginMsg.textContent = 'access granted — welcome back!';
  loginMsg.className = 'msg ok';
  if (data.session) goSignedIn(data.email, data.name);
}
