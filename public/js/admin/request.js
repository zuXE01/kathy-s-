import { getAuthClient } from '../auth-client.js';

let generation = 0;
export function cancelRequests() { generation++; }
export function request(path, options, callback) {
  const current = generation;
  getAuthClient().then(async function send(client) {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) throw Object.assign(new Error('Please sign in again.'), { status: 401 });
    const response = await fetch('/api/admin' + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'Request failed.'), { status: response.status });
    return result;
  }).then(function received(data) {
    if (current === generation) callback(null, data);
  }, function failed(error) {
    if (current !== generation) return;
    if (error.status === 401 || error.status === 403) window.dispatchEvent(new CustomEvent('admin-denied', { detail: error.message }));
    callback(error);
  });
}
