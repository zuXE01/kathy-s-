# Kathy's Hub

A responsive cafe member interface with a cream, red, and indigo theme, built with HTML, CSS, JavaScript, Express, and SQLite (sql.js).

## Run locally

Install a supported Node.js LTS release, then run:

```sh
npm ci
npm start
```

Open http://localhost:3000. The server creates a local `kathyshub.sqlite` file on first start. The existing demo account is `admin@site.dev` with password `1234`.

## Features

- Registration and login connected to the Express API
- Personalized member dashboard and account display
- Filterable illustrative menu cards
- Responsive desktop and phone layouts
- Rewards and reservation placeholders (coming soon)

## Structure

```text
public/
  index.html
  styles.css
  app.js
  js/
    api.js
    elements.js
    tabs.js
    login.js
    register.js
    password-reset.js
    dashboard.js
    menu.js
    navigation.js
  assets/logo.jpg
server.js
package.json
package-lock.json
```

## Demo limitations

Frontend logic is organized into ES modules. `app.js` only initializes each feature; each feature registers named event callbacks. `api(path, body, callback)` calls `callback(null, data)` on success or `callback(error, null)` on failure. Open the app through the Node server, not by double-clicking the HTML file, so the browser can load the modules.

This is a development demo, not ready for public deployment. The existing password-reset endpoint does not verify account ownership; login does not establish a persistent server session; demo credentials and missing rate limits must be addressed before use with real accounts. Menu items are illustrative, and ordering, reservations, and rewards are not connected to backend services.

Database files and node_modules are intentionally excluded. Keep customer data and secrets out of Git. Configure persistent storage, HTTPS, backups, and production authentication before deployment. GitHub Pages alone cannot run this Express backend.

## Verification

The dashboard was browser-tested on desktop and at a 390px phone width, using simulated API responses for successful/failed login, menu filtering, and logout. Those checks do not validate production backend security.
