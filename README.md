# Kathy's Hub

A responsive cafe member experience built with HTML, CSS, JavaScript, Express, and Supabase Auth.

**Live website:** https://kathy-s.onrender.com

## Features

- Supabase email registration, login, email confirmation, and password recovery
- Persistent browser sessions with protected account display
- Responsive member dashboard with 120 photo-transcribed menu products, search, section filters, sorting and size/portion prices
- Shared menu cards and admin editing, with database duplicate protection
- Render-ready Express server with security headers and a health endpoint
- Mobile-first cart and separate [demo checkout](CHECKOUT.md) with COD, simulated online payment, and delivery address

## Run locally

Requirements: Node.js 22 and a Supabase project.

1. Copy `.env.example` to `.env`.
2. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from Supabase Project Settings.
3. Install dependencies and start the server:

```sh
npm ci
npm start
```

Open http://localhost:3000. Do not open `public/index.html` directly because the browser must load the app through Express.

## Supabase setup

In Supabase Authentication URL Configuration, set:

- Site URL: your local or Render URL
- Redirect URL: the same URL with a trailing `/`

The application only uses the publishable key in the browser. Never put a Supabase `service_role` key in `.env.example`, the frontend, or GitHub.

To store registration details in Supabase Table Editor, open the SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql), and then register a new account. This creates `public.profiles` and automatically copies each user's name, birthday, and gender from Auth metadata into that table. The SQL also backfills existing Auth users.

## Deploy to Render

This repository includes `render.yaml` for a Render Blueprint deployment.

1. Push the repository to GitHub.
2. In Render, choose **New > Blueprint** and select the repository.
3. Enter values for `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` when prompted.
4. Add the resulting Render URL to Supabase Authentication URL Configuration.

The equivalent manual settings are:

```text
Build command: npm ci
Start command: npm start
Health check path: /health
```

Render supplies the `PORT` value. `NODE_ENV=production` enables production security headers.

## Project structure

```text
public/          Browser UI and feature modules
server/app.js    Express app, security headers, and account verification
server.js        Production entrypoint
test/            Node test suite
supabase/schema.sql  Profiles table and Auth trigger
render.yaml      Render deployment configuration
```

## Development notes

The menu was transcribed from the supplied Kathy's Diners / Cafe photos. See [menu setup, editing and verification](MENU_CATALOG.md) before setting up another database. Checkout is not connected to backend services yet. Supabase controls authentication and email delivery; configure its email provider and production policies before inviting real customers.

Run the tests with:

```sh
npm test
```
