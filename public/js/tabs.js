import { tabLoginBtn, tabRegisterBtn, loginView, registerView, loginMsg, registerMsg } from './elements.js';
export function showTab(which){
    const isLogin = which === 'login';
    tabLoginBtn.classList.toggle('active', isLogin);
    tabRegisterBtn.classList.toggle('active', !isLogin);
    loginView.classList.toggle('active', isLogin);
    registerView.classList.toggle('active', !isLogin);
    loginMsg.textContent = ''; loginMsg.className = 'msg';
    registerMsg.textContent = ''; registerMsg.className = 'msg';
  }

export function initTabs() {
  tabLoginBtn.addEventListener('click', handleLoginTab);
  tabRegisterBtn.addEventListener('click', handleRegisterTab);
  document.getElementById('toRegister').addEventListener('click', handleRegisterTab);
}
function handleLoginTab() { showTab('login'); }
function handleRegisterTab(event) {
  event.preventDefault();
  showTab('register');
}

