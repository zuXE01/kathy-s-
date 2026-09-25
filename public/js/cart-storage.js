const key = 'kathys-demo-cart';
export function saveCart(items) {
  sessionStorage.setItem(key, JSON.stringify(items));
}
export function readCart() {
  try {
    const items = JSON.parse(sessionStorage.getItem(key) || '[]');
    return Array.isArray(items) ? items.slice(0,120) : [];
  } catch { return []; }
}
export function forgetCart() {
  try { sessionStorage.removeItem('kathys-checkout-request'); } catch {}
  try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
}
