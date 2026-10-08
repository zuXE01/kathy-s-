const destinations = new Set(['/#menu','/','/checkout.html','/account.html','/account.html?from=checkout','/orders.html','/admin.html']);
export function safeDestination(value) { return destinations.has(value) ? value : '/#menu'; }
export function signInPath(destination) { return '/signin.html?next=' + encodeURIComponent(safeDestination(destination)); }
export function returnDestination(search) { return safeDestination(new URLSearchParams(search).get('next')); }
// Navigation only: the staff API still enforces access independently.
export function signedInDestination(search, user) {
  return user?.app_metadata?.hub_role === 'kitchen_staff' ? '/admin.html' : returnDestination(search);
}
