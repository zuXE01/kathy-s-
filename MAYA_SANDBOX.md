# Maya Checkout sandbox

This is a demo-only payment flow, not production payment support. Existing COD and simulated-online options remain unchanged. The cancellation hardening requires the additional SQL below and an application deployment; local edits do not update the live website.

## Enable later, in this order

1. In the same Supabase project used by this app, run `supabase/maya-sandbox-setup.sql` in the SQL editor **after** the existing order setup. Back up your project first. This adds a payment table, restricts its writes to the server role, and blocks kitchen progression until a test payment is verified. It does not remove existing orders or change assigned roles. Do not run the verification SQL on your live project.
2. Run `supabase/maya-cancellation-setup.sql` after the sandbox setup, including for existing installations. It adds coordinated cancellation guards and a caller-RLS payment-exception view without deleting orders. Add `SUPABASE_SECRET_KEY` to the local `.env` using your project's server-only secret API key. Do not paste it into chat, HTML, browser code, Git, or the publishable-key setting. Keep `.env` ignored by Git.
3. Set `APP_BASE_URL=http://localhost:3000` for local testing (use your actual port). For Render, use your exact HTTPS website origin, without a path. The return URL is built from this setting, never from untrusted request headers.
4. Set `MAYA_SANDBOX_PUBLIC_DEMO=true` and `MAYA_SANDBOX_ENABLED=true`. No private Maya key is needed in this mode: the server uses Maya's published shared test pair. Until setup is complete, leave `MAYA_SANDBOX_ENABLED=false`; enabling with missing credentials intentionally stops startup with an explanatory error.
5. Restart with `npm start`. Sign in as a customer, add items, and select **Maya Checkout — SANDBOX**. Place the demo order and use **Open Maya test checkout** on the separate payment page.
6. Use only [Maya's official sandbox wallet/card credentials](https://developers.maya.ph/reference/sandbox-credentials-and-cards). Never enter a real card, wallet login, or real OTP. After returning, the server verifies the payment; use **Check payment status** if it is still pending.
7. For Render later, apply the SQL first, copy the same server-only settings to its environment, set the real HTTPS `APP_BASE_URL`, then deploy/restart. Verify customer payment and staff flows before a demonstration. Nothing in this local change deploys the app.

## Private sandbox keys and optional webhooks

When your own sandbox keys are available, set `MAYA_SANDBOX_PUBLIC_DEMO=false`, `MAYA_SANDBOX_PUBLIC_KEY=pk-...` and `MAYA_SANDBOX_SECRET_KEY=sk-...`. Only sandbox API endpoints are implemented; **do not supply production keys**. Existing sessions belong to the merchant that created them, so finish/cancel old test orders before switching merchants.

Do not register, delete, or modify webhooks on the shared public merchant. Manual status checks and return-page verification support initial shared-sandbox testing.

For your private sandbox merchant only, the prepared callback URL is `https://YOUR-SITE/api/payments/maya/webhook`. Register the success/failure/cancel/expiry events using Maya's private sandbox tools. This change does not register them for you. See [Maya's webhook configuration guide](https://developers.maya.ph/reference/configuring-your-webhook-for-maya-checkout).

The callback checks Maya's documented sandbox source IPs and then retrieves authoritative payment data; the callback body cannot mark an order paid. Configure `TRUST_PROXY_HOPS` only for your verified hosting topology. Do not disable source checks or trust arbitrary forwarded IP headers. Verify actual Render ingress behavior before relying on callbacks. Callback verification is synchronous with a four-second provider timeout; slow database/provider responses may miss Maya's response deadline. Customer status checks are the recovery path; durable webhook queues and scheduled reconciliation are not implemented.

## What the code protects

- The saved, database-repriced order determines PHP amount. Browser totals, redirect query parameters and webhook status claims are not payment proof.
- Payment access requires a verified non-anonymous account that owns the order. Customer contact/address information is not sent to the shared merchant; buyer details are synthetic.
- One payment attempt per saved order is claimed through a unique database constraint before contacting Maya. Concurrent taps cannot intentionally create multiple sessions. An uncertain network result is reconciled by the unique request reference, not blindly recreated.
- Verification matches payment ID, reference, exact amount and PHP currency. Success requires Maya's successful state and `isPaid=true`. Unknown states stay under review.
- Verified success is sticky against late failure responses. Refunds, voids, disputes and real settlement are outside this demo integration.
- Database triggers block acceptance/preparation/readiness/completion of unverified Maya orders, including direct database API attempts. The staff API also removes unavailable forward actions. Cancellation and rejection remain available according to existing roles.
- Payment rows contain provider details unavailable to browser database clients. Customers and permitted staff can read only order ID, user ID and sandbox status under RLS. Server responses expose no secret keys or raw provider payloads.

`orders.payment_status` remains an immutable `unpaid` snapshot for Maya orders. The authoritative test result lives in `maya_sandbox_payments.status`; customer history and staff APIs join that result. Do not use the snapshot alone to determine Maya payment completion.

## Recovery and limitations

- Failed, cancelled or expired sessions cannot be restarted on the same order. Cancel the pending demo order in **My orders**, then create a new demo order.
- If session creation times out, use **Check payment status**. If Maya has a record but the redirect URL was never saved, verification can recover the result but may not recover a checkout link. Do not blindly pay again; wait for expiry or have the restaurant review/cancel the test order.
- Cancelling an unpaid Maya order first cancels its provider session and retrieves authoritative confirmation. If Maya is unreachable or the result is uncertain, the order stays open. A durable cancellation claim prevents a simultaneous first checkout from starting. Database guards also block direct order closure without confirmation.
- Verified paid orders cannot be cancelled. Staff may reject a paid order with a warning; closed paid orders appear in the staff **Payment review** filter and show customer-facing review notices. A late verified success remains visible rather than being discarded. No refund is issued automatically; production still requires void/refund handling and reconciliation.
- Public sandbox keys are shared by unrelated developers. Use only sample order/contact details throughout this demo. This is not a private merchant environment or a production trust boundary.
- No real deliveries, refunds, reconciliation scheduler or production payment processing have been added. Keep sandbox orders away from real restaurant fulfilment.

## Verification

Run `npm test` and `npm run test:database` after `npm install` (including development dependencies). The database command uses isolated PGlite and never connects to Supabase. It checks repeatable setup, role isolation, blocked forged payments, immutable verified status, and blocked unverified kitchen transitions alongside existing order safeguards.

The sandbox API was contacted with synthetic data on 2026-10-09: session creation and lookup by both ID and request reference responded. A further synthetic create/cancel/retrieve check on 2026-10-10 confirmed `PAYMENT_CANCELLED`. No real payment or customer order was used. Full customer checkout, live cancellation SQL/Render rollout, webhook delivery and real-phone layout still need verification.

References: [Create Checkout](https://developers.maya.ph/reference/createv1checkout), [retrieve by ID](https://developers.maya.ph/reference/getpaymentviapaymentid-1), [payment states](https://developers.maya.ph/reference/payment-statuses).
