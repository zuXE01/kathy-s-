// Entry point: feature modules own their logic and named event callbacks.
import { initTabs } from './js/tabs.js';
import { initLogin } from './js/login.js';
import { initRegister } from './js/register.js';
import { initPasswordReset } from './js/password-reset.js';
import { initSession } from './js/session.js';

initTabs();
initLogin();
initRegister();
initPasswordReset();
initSession();
