# Kathy's Hub

A mobile-first restaurant website built with HTML, CSS, JavaScript, Express, and Supabase Auth.

**Live website:** https://kathy-s.onrender.com

## Features

- Supabase email registration, login, email confirmation, and password recovery
- Persistent browser sessions with protected account display
- Public landing page and shared menu with 120 photo-transcribed products, search, section filters and size/portion prices
- Authentication-only sign-in page with validated return destinations, plus a separate My Account page with saved contact details and checkout address autofill
- Shared menu cards and admin editing, with database duplicate protection
- Render-ready Express server with security headers and a health endpoint
- Mobile-first cart and [saved-order checkout](CHECKOUT.md) with COD, simulated online payment, and delivery address
- Customer order history with pending-order cancellation
- Admin Orders queue with customer details, status filters, acceptance/rejection, cancellation, and status history
- Role-based access for customers, staff, kitchen staff, owners, and future platform administrators

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

### Staff roles

Assign `app_metadata.hub_role` through a trusted Supabase admin workflow. Supported roles are `owner`, `staff`, `kitchen_staff`, `platform_admin`, and the legacy `admin` value (treated as `owner`). Staff can access order operations, kitchen staff can update preparation/readiness states, and only owners/platform administrators can manage menus and member data. Customers have no staff access.

The server returns the permitted next actions on each order; kitchen staff only see Preparing and Ready when the current order stage permits them. Staff dashboards show order counts instead of restricted member/menu totals. A forbidden action displays an error without closing the workspace; losing workspace access clears private data. Role or account changes recheck permissions.

Database policies must match the server: run the existing `admin-setup.sql` and `orders-setup.sql` setups after their documented prerequisites. The live project was aligned on 2026-09-26 with migration `align_staff_role_access_and_order_transitions`, preserving legacy admin access. No user roles were assigned by this update. After changing a role through a trusted administrator, refresh the user's session (sign out and back in) so JWT-based database rules receive the new role; old JWT claims can remain valid until expiry.

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
public/              Browser pages, styles, and assets
public/js/pages/     Page entry points and page-specific orchestration
public/js/admin/     Admin workspace modules and API adapter
public/js/*.js       Shared browser/domain modules kept stable for reuse
server/app.js        Express app, security headers, and route mounting
server/              Server routes, validation, menu storage, and order logic
server.js            Production entrypoint
test/                Node test suite organized by feature
supabase/             Schema, RLS/triggers, setup, and verification SQL
render.yaml          Render Blueprint deployment
```

Keep public URLs and HTML entry points stable. Add new page behavior under `public/js/pages/`, reusable browser logic in the shared module layer, admin-only behavior under `public/js/admin/`, and server-side data rules in `server/` or Supabase rather than duplicating them in page scripts.

## Development notes

The menu was transcribed from the supplied Kathy's Diners / Cafe photos. See [menu setup, editing and verification](MENU_CATALOG.md) before setting up another database. Orders are saved through the server to Supabase. See [order setup and limits](CHECKOUT.md). Payments and delivery booking remain demo-only. Supabase controls authentication and email delivery; configure its email provider and production policies before inviting real customers.

Run the tests with:

```sh
npm test
```
