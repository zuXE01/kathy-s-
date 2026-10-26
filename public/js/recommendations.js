import { getAuthClient } from './auth-client.js';
import { createMenuCard } from './menu-card.js';
import { addToCart } from './cart.js';

export function initRecommendations() {
  const panel = document.getElementById('recommendations');
  if (!panel) return;
  const form = document.getElementById('recommendationForm');
  const status = document.getElementById('recommendationStatus');
  const grid = document.getElementById('recommendationGrid');
  const history = document.getElementById('recommendationHistory');
  const submit = form.querySelector('button[type="submit"]');
  let signedIn = document.body.dataset.menuAccess === 'member', generation = 0, controller;
  const selections = new Map();
  function clear() {
    generation++; controller?.abort(); grid.replaceChildren(); selections.clear();
    submit.disabled = false; grid.setAttribute('aria-busy', 'false');
    status.textContent = 'Choose your preferences, then find suggestions. The full menu stays below.';
    status.removeAttribute('data-error');
  }
  function access(value) {
    clear(); signedIn = value; history.checked = false; history.disabled = !value;
    document.getElementById('recommendationHistoryHelp').textContent = value
      ? 'Optional. Uses up to 50 of your most recent completed orders for this request.'
      : 'Sign in to include your completed orders. Everyone can get preference-based suggestions.';
  }
  access(signedIn);
  window.addEventListener('customer-access-changed', event => access(event.detail.signedIn));
  // Clear personal results on account switches too, including switches without sign-out.
  let owner;
  getAuthClient().then(client => {
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user?.id;
      if (next !== owner) { owner = next; access(!!next); }
    });
    window.addEventListener('pagehide', () => data.subscription.unsubscribe(), { once: true });
  }).catch(() => {});
  window.addEventListener('pagehide', clear);
  form.addEventListener('input', clear);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    clear();
    const request = generation;
    const abort = new AbortController(); controller = abort;
    const timeout = setTimeout(() => abort.abort(), 15000);
    submit.disabled = true; grid.setAttribute('aria-busy', 'true');
    status.textContent = 'Finding menu suggestions…';
    const wantsHistory = history.checked && signedIn;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (wantsHistory) {
        const client = await getAuthClient();
        const { data, error } = await client.auth.getSession();
        if (error || !data.session) throw new Error('Sign in again, or turn off completed orders and retry.');
        headers.Authorization = 'Bearer ' + data.session.access_token;
      }
      if (generation !== request) return;
      if (abort.signal.aborted) throw new Error('Suggestions took too long. Please retry.');
      const budget = document.getElementById('recommendationBudget').value;
      const response = await fetch('/api/recommendations', { method: 'POST', headers, cache: 'no-store', signal: abort.signal,
        body: JSON.stringify({ category: document.getElementById('recommendationGroup').value,
          section: document.getElementById('mobileMenuSection').value,
          budget: budget === '' ? null : Number(budget), useHistory: wantsHistory }) });
      const result = await response.json();
      if (generation !== request) return;
      if (!response.ok) throw new Error(result.error || 'Suggestions are unavailable. Please retry or browse below.');
      if (!Array.isArray(result.recommendations)) throw new Error('Suggestions could not be read. Please retry.');
      result.recommendations.forEach(({ item, reasons }) => {
        const card = createMenuCard(item, { onAdd: signedIn ? addToCart : undefined,
          selectedLabel: selections.get(item.id), onOptionChange: label => selections.set(item.id, label) });
        const reason = document.createElement('p'); reason.className = 'recommendation-reason';
        reason.textContent = reasons.join(' '); card.append(reason); grid.append(card);
      });
      const historyNote = { used: ' Suggestions consider your completed orders.', empty: ' No completed orders yet; these use your current preferences.',
        unavailable: ' Your order history could not be loaded; these use only your current preferences.', off: '' }[result.history] || '';
      status.textContent = (result.recommendations.length ? 'Suggestions for you.' : 'No items match. Raise the price limit, change the menu section, or choose another group.') + historyNote;
    } catch (error) {
      if (generation !== request) return;
      status.setAttribute('data-error', 'true');
      status.textContent = abort.signal.aborted ? 'Suggestions took too long. Try again or browse the menu below.' : error.message;
    } finally {
      clearTimeout(timeout);
      if (generation === request) { submit.disabled = false; grid.setAttribute('aria-busy', 'false'); }
    }
  });
  // A changed catalog section invalidates the previous suggestions.
  document.getElementById('mobileMenuSection').addEventListener('change', clear);
  document.getElementById('catalogFilters').addEventListener('click', clear);
  document.getElementById('catalogClear').addEventListener('click', clear);
}

initRecommendations();
