// Entry point: feature modules own their logic and named event callbacks.
import { initTabs } from '../tabs.js';
import { initLogin } from '../login.js';
import { initRegister } from '../register.js';
import { initPasswordReset } from '../password-reset.js';
import { initSession } from '../session.js';

initTabs();
initLogin();
initRegister();
initPasswordReset();
initSession();
