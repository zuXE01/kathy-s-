const destinations = new Set(['/#menu','/','/checkout.html','/account.html','/account.html?from=checkout','/admin.html']);
export function safeDestination(value) { return destinations.has(value) ? value : '/#menu'; }
export function signInPath(destination) { return '/signin.html?next=' + encodeURIComponent(safeDestination(destination)); }
export function returnDestination(search) { return safeDestination(new URLSearchParams(search).get('next')); }
