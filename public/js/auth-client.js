let clientPromise;

export function getAuthClient() {
  if (!clientPromise) {
    clientPromise = fetch('/api/config').then(function readConfig(response) {
      if (!response.ok) throw new Error('Sign-in configuration is unavailable. Please try again later.');
      return response.json();
    }).then(function createAuth(config) {
      return window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }).catch(function allowRetry(error) {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export function authAction(action, callback) {
  getAuthClient().then(action).then(function unwrap(result) {
    if (result.error) throw result.error;
    return result.data;
  }).then(function success(data) { callback(null, data); },
    function failure(error) { callback(error, null); });
}
