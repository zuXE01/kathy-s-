# Kathy's Hub — project logic flowchart

Reviewed against the current local source on 2026-10-20. This is a system-level map of the browser pages, Express API, Supabase persistence/authentication, and optional Maya sandbox. It is not a deployment diagram or a line-by-line call graph. The main route and data boundaries are shown; UI details that do not change the workflow are summarized.

## Shape identifier key

Each Mermaid node ID is a stable shape identifier. IDs use `AREA_NUMBER` (for example, `ORD_07`); edges use the node ID and should be updated if a node is renamed. Shapes follow common flowchart conventions:

| Shape | Meaning |
| --- | --- |
| `([ ... ])` | Start, end, or external actor/system |
| `[ ... ]` | Page, action, or process |
| `{ ... }` | Decision or validation gate |
| `[( ... )]` | Persistent store or external service |
| `[/ ... /]` | Input, output, or user-visible result |

## 1. Whole-project route and service map

```mermaid
flowchart TD
  SYS_01([Customer, guest, or staff]) --> WEB_01[Express app startup]
  WEB_01 --> SYS_02{Required Supabase URL and publishable key valid?}
  SYS_02 -- No --> SYS_03([Startup stops with configuration error])
  SYS_02 -- Yes --> WEB_02[Helmet security headers, proxy policy, API rate limits]
  WEB_02 --> WEB_03{HTTP route}
  WEB_03 -- GET / --> CUS_01[/Public landing and menu/]
  WEB_03 -- GET /signin.html --> AUTH_01[Sign in, registration, password recovery]
  WEB_03 -- GET /account.html --> ACC_01[Customer account and saved details]
  WEB_03 -- GET /checkout.html --> ORD_01[Authenticated checkout]
  WEB_03 -- GET /orders.html --> ORD_11[Customer order history]
  WEB_03 -- GET /payment.html --> PAY_01[Maya sandbox payment page]
  WEB_03 -- GET /reservations.html --> RSV_01[Package comparison and inquiry draft]
  WEB_03 -- GET /admin.html --> STF_01[Staff workspace]
  WEB_03 -- GET /health --> WEB_04[/Health response/]
  WEB_03 -- GET /api/config --> SVC_01[/Supabase browser configuration/]
  WEB_03 -- GET /api/menu --> MENU_01[Public menu read]
  WEB_03 -- /api/orders --> ORD_12[Order API: verified signed-in customer]
  WEB_03 -- /api/admin --> STF_02[Admin API: verified staff role]
  WEB_03 -- /api/payments/maya --> PAY_02[Maya API and webhook]
  WEB_03 -- other /api route --> WEB_05[/404 JSON response/]
  WEB_03 -- static assets --> WEB_06[/Files from public/]
  AUTH_01 <--> DB_01[(Supabase Auth)]
  ACC_01 <--> DB_02[(Profiles and customer details with RLS)]
  MENU_01 <--> DB_03[(Menu catalog)]
  ORD_12 <--> DB_04[(Orders, guarded by RLS and database triggers)]
  STF_02 <--> DB_03
  STF_02 <--> DB_04
  STF_02 <--> DB_05[(Profiles and payment investigation data)]
  PAY_02 <--> DB_06[(Maya payment state / optional attempt ledger)]
  PAY_02 <--> SYS_04([Maya sandbox API])
  RSV_01 --> SYS_05([User email app; only after user chooses mail link])
```

## 2. Customer access, menu, and account

```mermaid
flowchart TD
  CUS_01([Open public landing page]) --> CUS_02[Load public menu from GET /api/menu]
  CUS_02 --> CUS_03[(Supabase menu_items; public/available rows)]
  CUS_03 --> CUS_04[/Render menu, portions, prices, search and filters/]
  CUS_04 --> CUS_05{Signed in?}
  CUS_05 -- No --> CUS_06[Browse menu and prices; ordering controls unavailable]
  CUS_06 --> CUS_07{Choose sign in or create account?}
  CUS_07 -- Yes --> AUTH_01[Sign-in page: sign in, register, or reset password]
  AUTH_01 --> AUTH_02{Supabase Auth succeeds?}
  AUTH_02 -- No --> AUTH_03[/Show field or service error; allow retry/]
  AUTH_03 --> AUTH_01
  AUTH_02 -- Yes --> AUTH_04[Return to validated local next destination]
  AUTH_04 --> CUS_05
  CUS_05 -- Yes --> CUS_08[Enable add-to-cart and cart launcher]
  CUS_08 --> CUS_09[(Same-tab cart storage)]
  CUS_09 --> ORD_01[Continue to checkout]
  CUS_05 --> ACC_01[Open My Account]
  ACC_01 --> ACC_02{Verified user session?}
  ACC_02 -- No --> ACC_03[/Ask user to sign in/]
  ACC_02 -- Yes --> ACC_04[Load own contact/address details]
  ACC_04 --> ACC_05[(Customer details; owner-scoped access)]
  ACC_05 --> ACC_06{Save details?}
  ACC_06 -- Yes --> ACC_07[Validate and save for future checkout]
  ACC_07 --> ACC_05
  ACC_06 -- No --> ACC_08([Return to menu or checkout])
```

## 3. Checkout, idempotency, and customer order tracking

```mermaid
flowchart TD
  ORD_01([Open checkout]) --> ORD_02{Verified non-anonymous customer?}
  ORD_02 -- No --> ORD_03[/Show sign-in path; no order submission/]
  ORD_02 -- Yes --> ORD_04{Recover request ID in this tab for same user?}
  ORD_04 -- Yes --> ORD_05[GET /api/orders/request/:requestId]
  ORD_05 --> ORD_06{Saved order found?}
  ORD_06 -- Yes --> ORD_10[/Show saved order confirmation; avoid duplicate/]
  ORD_06 -- No --> ORD_07[Read cart and current public menu; reprice and validate choices]
  ORD_04 -- No --> ORD_07
  ORD_07 --> ORD_08{Cart has valid available items?}
  ORD_08 -- No --> ORD_09[/Explain empty, changed, or unavailable cart; return to menu/]
  ORD_08 -- Yes --> ORD_13[Show current total and customer/address form; optionally prefill saved details]
  ORD_13 --> ORD_14{Details valid and user submits?}
  ORD_14 -- No --> ORD_15[/Keep form editable; display validation or leave warning/]
  ORD_15 --> ORD_13
  ORD_14 -- Yes --> ORD_16[Keep random request ID plus owner in session storage; POST /api/orders]
  ORD_16 --> ORD_17{Server validates token, fields, unique lines, method, and request ID?}
  ORD_17 -- No --> ORD_18[/Return 401, 400, or service error; retain recovery path/]
  ORD_17 -- Yes --> ORD_19[(Supabase order insert: trigger verifies availability, variant price, total; writes pending + history)]
  ORD_19 --> ORD_20{Same owner/request ID already saved?}
  ORD_20 -- Matching request hash --> ORD_21[/Return prior order as reused/]
  ORD_20 -- Different request hash --> ORD_22[/409 recovery: load saved order or refresh changed menu/]
  ORD_20 -- New row saved --> ORD_23{Payment method?}
  ORD_21 --> ORD_23
  ORD_23 -- COD --> ORD_24[/Confirm saved order; unpaid; link to My orders/]
  ORD_23 -- Demo online --> ORD_25[/Confirm saved order; simulated only; link to My orders/]
  ORD_23 -- Maya sandbox --> PAY_01[Owned payment page: check existing attempt or start once]
  ORD_24 --> ORD_11[Customer order history]
  ORD_25 --> ORD_11
  PAY_01 --> ORD_11
  ORD_11 --> ORD_26[GET /api/orders; return only the authenticated user's orders]
  ORD_26 --> ORD_27[(Supabase orders, newest-first pages; attach authoritative Maya state)]
  ORD_27 --> ORD_28[/Render status history, payment label, refresh/retry and pagination/]
  ORD_28 --> ORD_29{Pending and customer requests cancellation?}
  ORD_29 -- No --> ORD_30([Refresh while visible; stop on hidden page or sign-out])
  ORD_29 -- Yes --> ORD_31[POST /api/orders/:id/cancel; owner + pending + version checks]
  ORD_31 --> ORD_32{Maya order?}
  ORD_32 -- No --> ORD_33[(Database transition guard marks cancelled and appends history)]
  ORD_32 -- Yes --> ORD_34[Verify/cancel provider session before closing order]
  ORD_34 --> ORD_35{Cancellation confirmed?}
  ORD_35 -- No --> ORD_36[/Keep order open; explain uncertain payment state/]
  ORD_35 -- Yes --> ORD_33
```

## 4. Reservations inquiry (client-only)

```mermaid
flowchart TD
  RSV_01([Open reservations page]) --> RSV_02[/Read local brochure-derived offers and rates/]
  RSV_02 --> RSV_03[Filter event family; select offer and optional guest tier]
  RSV_03 --> RSV_04[Enter contact, event date, guest count, and notes]
  RSV_04 --> RSV_05{Capacity, date, and required fields valid?}
  RSV_05 -- No --> RSV_06[/Show inline validation; no draft generated/]
  RSV_06 --> RSV_04
  RSV_05 -- Yes --> RSV_07[Build inquiry text and mailto URL in page memory]
  RSV_07 --> RSV_08[/Show reviewable draft; user may edit selection and regenerate/]
  RSV_08 --> RSV_09{Copy message or open email app?}
  RSV_09 -- Copy --> RSV_10[/Copy text to clipboard; user sends it manually/]
  RSV_09 -- Email --> RSV_11([Open user's email app with draft])
  RSV_10 --> RSV_12([Page exit clears draft and personal form values])
  RSV_11 --> RSV_12
```

## 5. Staff workspace and order state transitions

```mermaid
flowchart TD
  STF_01([Open staff workspace]) --> STF_03{Supabase session and server role valid?}
  STF_03 -- No --> STF_04[/Gate workspace; clear private data/]
  STF_03 -- Yes --> STF_05[GET /api/admin/overview; derive role-specific navigation and metrics]
  STF_05 --> STF_06{Role}
  STF_06 -- Kitchen staff --> STF_07[Open active order queue; orders only]
  STF_06 -- Staff --> STF_08[Orders, overview, and payment investigation]
  STF_06 -- Owner/platform admin --> STF_09[Orders, menu management, members, payments, overview]
  STF_07 --> STF_10[GET /api/admin/orders?status=active; oldest first, paged]
  STF_08 --> STF_10
  STF_09 --> STF_10
  STF_10 --> STF_11[(Supabase orders; server attaches approved actions and permitted contact details)]
  STF_11 --> STF_12[/Queue cards show preparation summary, age, status and permitted action/]
  STF_12 --> STF_13{Choose next status}
  STF_13 -- Accept / reject / complete / cancel --> STF_14{Role permits action?}
  STF_13 -- Preparing / ready --> STF_14
  STF_14 -- No --> STF_15[/403; preserve workspace and explain denial/]
  STF_14 -- Yes --> STF_16[PATCH /api/admin/orders/:id with status, note, version]
  STF_16 --> STF_17{Transition valid, note valid, and version current?}
  STF_17 -- No --> STF_18[/400 or 409; keep dialog open and refresh/review/]
  STF_17 -- Yes --> STF_19{Maya payment permits closure/progression?}
  STF_19 -- No --> STF_20[/Keep order open or require payment review/]
  STF_19 -- Yes --> STF_21[(Database trigger checks role/state, increments version, appends history)]
  STF_21 --> STF_10
  STF_06 -- Management --> STF_22[Menu CRUD: validate catalog fields; unique section/name; persist]
  STF_06 -- Management --> STF_23[Members: paginated profile read]
  STF_06 -- Staff or management --> STF_24[Payments: inspect history and request provider recheck]
  STF_24 --> PAY_03[Verify against Maya; never manually mark paid]
  STF_05 --> STF_25{Session/role changes or sign-out?}
  STF_25 -- Yes --> STF_04
  STF_25 -- No --> STF_05
```

**Order transition reference:** `pending → accepted | rejected | cancelled`; `accepted → preparing | rejected`; `preparing → ready | rejected`; `ready → completed`. Customer cancellation is limited to pending orders. Kitchen staff are limited to preparing/ready transitions, and Maya orders have additional verified-payment gates. Server and database checks remain authoritative even when the browser hides an action.

## 6. Maya sandbox payment and recovery

```mermaid
flowchart TD
  PAY_01([Open owned /payment.html?order=UUID]) --> PAY_04{Valid reference, signed in, and owns order?}
  PAY_04 -- No --> PAY_05[/Show invalid link or sign-in/]
  PAY_04 -- Yes --> PAY_06[Read server payment config and authoritative saved order/payment state]
  PAY_06 --> PAY_07{Sandbox enabled and saved total > 0?}
  PAY_07 -- No --> PAY_08[/Explain unavailable; COD/demo options remain separate/]
  PAY_07 -- Yes --> PAY_09{Action: check, start, resume, or confirmed retry?}
  PAY_09 -- Check --> PAY_10[POST /:id/check; retrieve provider status]
  PAY_09 -- Start --> PAY_11[POST /:id/start; claim one attempt before calling Maya]
  PAY_09 -- Resume --> PAY_12[/Use stored approved sandbox checkout URL/]
  PAY_09 -- Retry --> PAY_13[Verify prior attempt is closed, then claim retry for same order]
  PAY_11 --> PAY_14{Reliability ledger enabled?}
  PAY_13 --> PAY_14
  PAY_14 -- Yes --> PAY_15[(Attempt ledger, claim RPC, audit, durable recovery queue)]
  PAY_14 -- No --> PAY_16[(Legacy single payment row)]
  PAY_15 --> PAY_17([Maya sandbox API])
  PAY_16 --> PAY_17
  PAY_17 --> PAY_18[Server verifies reference, payment ID, amount, currency and provider paid state]
  PAY_10 --> PAY_18
  PAY_18 --> PAY_19{Verified paid?}
  PAY_19 -- Yes --> PAY_20[(Persist sandbox-paid; success is sticky)]
  PAY_19 -- No / uncertain --> PAY_21[(Persist pending, failed, or review; do not guess from return URL)]
  PAY_20 --> PAY_22[/Show test payment verified; no real money; track order/]
  PAY_21 --> PAY_23[/Show status and safe check/recovery guidance/]
  PAY_17 --> PAY_24([Optional webhook: source check then retrieve provider record])
  PAY_24 --> PAY_18
  PAY_25([Reliability worker when enabled]) --> PAY_26[Reconcile queued attempts; record result/audit]
  PAY_26 --> PAY_18
```

## Architecture review notes

- **Server trust boundary:** browser Supabase sessions are verified by the Express API for customer orders and staff routes. RLS and database triggers independently constrain order ownership, prices, transitions, history, and contact access.
- **Idempotent checkout:** a per-user request UUID and hash support recovery after uncertain saves. The browser stores only the request ID and user ID in tab storage; the server/database enforce uniqueness and reprice menu lines.
- **Privacy split:** kitchen responses omit customer contact fields; staff contact enrichment uses the explicitly authorized `order_contacts` database function and has no unrestricted fallback.
- **Reservations are not bookings:** package data and inquiry composition live in frontend modules. There is no reservation API or server persistence; the customer must send the generated email draft.
- **Payment remains sandbox-only:** Maya status is verified server-side against the provider. Reliability ledger/worker behavior is conditional on configuration and database setup; payment state never derives from a browser return URL.
- **Operations boundary:** this map describes local source only. It does not verify current Render deployment, live Supabase configuration, schema rollout, or provider account state.

## Main source map

| Flow | Main source files |
| --- | --- |
| Express routing and security | `server.js`, `server/app.js` |
| Public menu and cart | `public/js/pages/landing.js`, `public/js/menu.js`, `public/js/cart.js`, `public/js/cart-storage.js` |
| Authentication and account | `public/js/pages/auth.js`, `public/js/login.js`, `public/js/register.js`, `public/js/password-reset.js`, `public/js/pages/account.js`, `server/app.js` |
| Checkout and order protections | `public/js/pages/checkout.js`, `public/js/checkout-model.js`, `server/orders.js`, `supabase/orders-setup.sql` |
| Customer order history | `public/js/pages/orders.js`, `server/orders.js` |
| Reservations | `public/js/pages/reservations.js`, `public/js/reservation-offers.js`, `public/js/reservation-selection.js` |
| Staff workspace | `public/js/admin/main.js`, `public/js/admin/orders.js`, `public/js/admin/menu.js`, `public/js/admin/members.js`, `public/js/admin/payments.js`, `server/admin.js`, `server/roles.js` |
| Maya sandbox | `public/js/pages/payment.js`, `public/js/maya-handoff.js`, `server/maya-payments.cjs`, `server/maya-reliability.cjs`, `server/maya-client.cjs` |
| Core schema and access | `supabase/schema.sql`, `supabase/menu-catalog-setup.sql`, `supabase/orders-setup.sql`, Maya setup/verification SQL files |

For product behavior and UX acceptance criteria, see `PRODUCT.md`, `DESIGN.md`, `RESERVATIONS.md`, `MAYA_SANDBOX.md`, `PAYMENT_RELIABILITY.md`, and `UX_IMPROVEMENT_PLAN.md`.
