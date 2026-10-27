import { getAuthClient } from './auth-client.js';
import { createMenuCard } from './menu-card.js';
import { addToCart } from './cart.js';

export function initMenuChat() {
  const panel = document.getElementById('menuChat');
  if (!panel) return;
  const el = id => document.getElementById(id);
  const form = el('chatForm'), input = el('chatMessage'), log = el('chatLog'), grid = el('chatResults');
  const status = el('chatStatus'), mode = el('chatMode'), history = el('chatHistory');
  const send = el('chatSend'), retry = el('chatRetry'), cancel = el('chatCancel');
  const quick = [...panel.querySelectorAll('[data-chat-prompt]')];
  let state, signedIn = document.body.dataset.menuAccess === 'member', owner;
  let revision = 0, controller, pending = null, busy = false, disposed = false;
  function bubble(who, text) {
    const article = document.createElement('div'); article.className = 'chat-message chat-message-' + who;
    const label = document.createElement('strong'); label.textContent = who === 'user' ? 'You' : 'Kathy’s assistant';
    const paragraph = document.createElement('p'); paragraph.textContent = text;
    article.append(label, paragraph); log.append(article);
    while (log.children.length > 12) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  function setBusy(value) {
    busy = value; send.disabled = value; quick.forEach(button => { button.disabled = value; });
    cancel.hidden = !value; form.setAttribute('aria-busy', String(value));
  }
  function clearResults() { grid.replaceChildren(); el('chatResultsHeading').hidden = true; }
  function reset(message = 'What sounds good? Ask for food, drinks or desserts, and a price limit if you have one.') {
    revision++; controller?.abort(); state = undefined; pending = null; setBusy(false);
    clearResults(); log.replaceChildren(); input.value = ''; retry.hidden = true;
    status.textContent = ''; status.removeAttribute('data-error'); el('chatPreferences').textContent = '';
    bubble('assistant', message);
  }
  function access(value) {
    signedIn = value; history.checked = false; history.disabled = !value;
    el('chatHistoryHelp').textContent = value ? 'Optional. Your completed orders stay private to your account.' : 'Sign in to use your completed orders or add items to your cart.';
    reset();
  }
  access(signedIn);
  // Existing navigation verifies account access. Ignore ordinary token refreshes.
  window.addEventListener('customer-access-changed', event => {
    if (signedIn !== event.detail.signedIn) access(event.detail.signedIn);
  });
  getAuthClient().then(client => {
    if (disposed) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user?.id || null;
      if (owner !== undefined && next !== owner) access(false);
      owner = next;
    });
    window.addEventListener('pagehide', () => data.subscription.unsubscribe(), { once: true });
  }).catch(() => {});
  fetch('/api/chat/config', { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error('Config unavailable'); return response.json();
  }).then(config => {
    if (!disposed) mode.textContent = config.aiEnabled ? 'Cloud AI enabled. You can refine your request in a follow-up.' : 'Basic menu matching. Cloud AI is not connected.';
  }).catch(() => { if (!disposed) mode.textContent = 'Menu assistant. Send a message to check availability.'; });
  el('chatReset').addEventListener('click', () => { reset(); input.focus(); });
  history.addEventListener('change', () => reset(history.checked ? 'Completed orders enabled. Ask for your usual or tell me what you feel like.' : 'Completed orders turned off. What would you like to try?'));
  cancel.addEventListener('click', () => {
    revision++; controller?.abort(); setBusy(false); retry.hidden = !pending;
    status.textContent = 'Request stopped. You can retry or send another message.';
  });
  window.addEventListener('pagehide', () => { disposed = true; history.checked = false; reset(); });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  async function ask(text, isRetry = false) {
    const message = text.trim();
    if (busy || disposed || !message || message.length > 500) return;
    const current = ++revision;
    const request = isRetry && pending ? pending : { message, state, useHistory: signedIn && history.checked };
    pending = request;
    if (!isRetry) bubble('user', message);
    input.value = ''; clearResults(); retry.hidden = true; status.removeAttribute('data-error');
    status.textContent = 'Checking the menu…'; setBusy(true);
    const abort = new AbortController(); controller = abort;
    const timeout = setTimeout(() => abort.abort(), 20000);
    let abortListener;
    try {
      const aborted = new Promise((_, reject) => {
        abortListener = () => reject(new Error('Request stopped or took too long. Retry or browse the full menu.'));
        abort.signal.addEventListener('abort', abortListener, { once: true });
      });
      const response = await Promise.race([(async () => {
        const headers = { 'Content-Type': 'application/json' };
        if (request.useHistory) {
          const client = await getAuthClient();
          const { data, error } = await client.auth.getSession();
          if (error || !data.session) throw new Error('Sign in again or turn off completed orders to continue.');
          if (current !== revision || abort.signal.aborted) throw new Error('Request stopped.');
          headers.Authorization = 'Bearer ' + data.session.access_token;
        }
        const result = await fetch('/api/chat', { method: 'POST', headers, cache: 'no-store', signal: abort.signal, body: JSON.stringify(request) });
        const body = await result.json();
        if (!result.ok) throw Object.assign(new Error(body.error || 'Unable to reply. Retry or browse the full menu.'), { status: result.status });
        return body;
      })(), aborted]);
      if (current !== revision || disposed) return;
      if (typeof response.reply !== 'string' || !Array.isArray(response.recommendations) || !response.state) throw new Error('The reply could not be read. Please retry.');
      state = response.state; pending = null;
      bubble('assistant', response.reply);
      mode.textContent = { ai: 'Understood with cloud AI.', basic: 'Basic menu matching. Cloud AI is not connected.',
        fallback: 'Cloud AI is unavailable. Using basic menu matching for this reply.', guided: 'Menu and ordering guidance.' }[response.mode] || 'Menu assistant';
      const category = { all: 'Any category', bites: 'Food', coffee: 'Drinks', sweet: 'Desserts' }[state.category];
      el('chatPreferences').textContent = 'Current choices: ' + [category, state.section !== 'all' ? state.section : '', state.query,
        state.temperature !== 'any' ? state.temperature + ' portions' : '', state.budget !== null ? 'up to ₱' + state.budget + ' per portion' : 'any price'].filter(Boolean).join(' · ');
      response.recommendations.forEach(({ item, reasons }) => {
        const card = createMenuCard(item, { onAdd: signedIn ? (product, option) => {
          const added = addToCart(product, option);
          status.textContent = added ? product.name + ' added. Open View cart to review your order.' : 'Cart limit reached for this portion.';
          return added;
        } : undefined });
        const reason = document.createElement('p'); reason.className = 'chat-reason'; reason.textContent = reasons.join(' ');
        card.append(reason); grid.append(card);
      });
      el('chatResultsHeading').hidden = !response.recommendations.length;
      status.textContent = response.recommendations.length ? response.recommendations.length + ' suggestions ready below.' : 'Reply ready.';
    } catch (error) {
      if (current !== revision || disposed) return;
      if (error.status === 401 || error.status === 403) {
        access(false); status.textContent = 'Your session could not be verified. Sign in again or continue without completed orders.';
      } else {
        status.textContent = error.message; retry.hidden = false;
        if (!input.value) input.value = request.message;
      }
      status.setAttribute('data-error', 'true');
    } finally {
      clearTimeout(timeout); abort.signal.removeEventListener('abort', abortListener);
      if (current === revision) setBusy(false);
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); ask(input.value); });
  retry.addEventListener('click', () => { if (pending) ask(pending.message, true); });
  quick.forEach(button => button.addEventListener('click', () => ask(button.dataset.chatPrompt)));
}
initMenuChat();
