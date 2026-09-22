// Error-first callback: callback(error, data). Called once per request.
export function api(path, body, callback) {
  fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function readResponse(response) {
    return response.json().catch(function emptyBody() {
      return {};
    }).then(function checkResponse(data) {
      if (!response.ok) {
        throw new Error(data.error || ('Request failed (' + response.status + ')'));
      }
      return data;
    });
  }).then(
    function requestSucceeded(data) { callback(null, data); },
    function requestFailed(error) { callback(error, null); }
  );
}

