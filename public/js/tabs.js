import { tabLoginBtn, tabRegisterBtn, loginView, registerView, loginMsg, registerMsg } from './elements.js';
export function showTab(which){
    const isLogin = which === 'login';
    tabLoginBtn.classList.toggle('active', isLogin);
    tabRegisterBtn.classList.toggle('active', !isLogin);
    tabLoginBtn.setAttribute('aria-selected', String(isLogin));
    tabRegisterBtn.setAttribute('aria-selected', String(!isLogin));
    tabLoginBtn.tabIndex = isLogin ? 0 : -1;
    tabRegisterBtn.tabIndex = isLogin ? -1 : 0;
    loginView.classList.toggle('active', isLogin);
    registerView.classList.toggle('active', !isLogin);
    loginView.setAttribute('aria-hidden', String(!isLogin));
    registerView.setAttribute('aria-hidden', String(isLogin));
    loginMsg.textContent = ''; loginMsg.className = 'msg';
    registerMsg.textContent = ''; registerMsg.className = 'msg';
  }

export function initTabs() {
  tabLoginBtn.addEventListener('click', handleLoginTab);
  tabRegisterBtn.addEventListener('click', handleRegisterTab);
  document.getElementById('toRegister').addEventListener('click', handleRegisterTab);
  [tabLoginBtn,tabRegisterBtn].forEach(tab=>tab.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'Home' ? tabLoginBtn : event.key === 'End' ? tabRegisterBtn
      : tab === tabLoginBtn ? tabRegisterBtn : tabLoginBtn;
    showTab(target === tabLoginBtn ? 'login' : 'register');
    target.focus();
  }));
}
function handleLoginTab() { showTab('login'); }
function handleRegisterTab(event) {
  event.preventDefault();
  showTab('register');
  tabRegisterBtn.focus();
}

