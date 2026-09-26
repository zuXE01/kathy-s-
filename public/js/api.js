import { authAction } from './auth-client.js';

function validBirthday(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function api(path, body, callback) {
  authAction(function run(client) {
    if (path === '/api/login') {
      return client.auth.signInWithPassword({ email: body.email, password: body.password });
    }
    if (path === '/api/register') {
      if (!validBirthday(body.dob)) throw new Error('Enter a valid birthday.');
      return client.auth.signUp({
        email: body.email, password: body.password,
        options: {
          emailRedirectTo: window.location.origin + '/',
          // Display-only profile fields. Never authorize with editable metadata.
          data: { name: body.name, dob: body.dob, gender: body.gender }
        }
      });
    }
    throw new Error('Unsupported authentication action.');
  }, function complete(error, data) {
    if (error) { callback(error, null); return; }
    callback(null, { email: data.user?.email || body.email, name: data.user?.user_metadata?.name || '', session: data.session });
  });
}
