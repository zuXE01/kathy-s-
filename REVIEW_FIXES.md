# Review fixes — 2026-10-03

## Local changes

- Kitchen order cards/details tolerate privacy-filtered orders; kitchen defaults to accepted orders.
- Checkout confirmation works when a recovered order omits contact details.
- Direct SELECT on `orders.customer` is revoked. A bounded, authorized contact lookup allows customers' own orders and owner/staff access, denying kitchen access.
- Proxy trust is explicit (`TRUST_PROXY_HOPS`), bounded, and defaults to zero locally.
- Recovery state resets on sign-out/account changes; cart memory clears across account changes and external sign-out.
- Quantity controls retain the corresponding keyboard focus.
- Catalog supports exactly 5,000 items and explicitly rejects overflow.
- Repeatable profile/contact setup preserves existing profile data; a sanitized environment template is included.
- Order fixtures now honor SELECT projections and copy results, avoiding accidental database-object mutation in tests.

## App-first deployment — compatibility release

The compatibility application uses explicit safe order columns and treats contact lookup as optional enrichment. Missing RPCs, permission denials, or contact-service failures produce `contact_status: unavailable`, not a failed queue or failed status update. Staff see a warning; kitchen access never attempts contact lookup. No unrestricted contact-read fallback is used. Once the RPC is available, refreshing loads contacts without restarting the app.

This supports an **app-first** rollout, not arbitrary deployment order. Older application versions using `SELECT *` still fail after column protection is applied. Do not roll back to those versions once grants are tightened; retain this compatibility release as the rollback floor. Deploying the compatibility app alone does not fix legacy database grants or restore contact display.

1. Back up the database and test on a staging project first.
2. Deploy this compatibility application first and verify order listing, checkout/recovery, and status updates. Before the contact function exists, staff will see the contact-unavailable warning; plan the rollout so dispatch does not depend on unavailable addresses.
3. Existing installations: run the updated `supabase/orders-setup.sql` as the database administrator. This repeatable setup preserves orders and roles. It installs the contact functions, restricts grants, and requests a PostgREST schema-cache refresh in one transaction. Refresh the staff queue afterward and verify contacts load. If SQL fails, keep the compatible app running and investigate; do not restore broad contact grants as a workaround.
4. Run `supabase/orders-verification.sql` in staging. Its sample order changes roll back; it needs two auth users and an available menu variant.
5. Verify real customer checkout/recovery, staff contact access, kitchen preparation/readiness, and direct API denial of the customer column.
6. Confirm the host's proxy topology before setting `TRUST_PROXY_HOPS` (for a verified single trusted ingress, use `1`). Test that different clients have independent rate-limit buckets and that forged forwarded addresses cannot bypass the ingress. Keep `0` for direct local access.

No live database policies, hosting settings, or role assignments are changed by editing these files. Refresh sessions after role changes; JWT role claims may remain valid until expiry.

## Verification performed

- The compatibility release adds tests for missing contact RPCs, permission/network failures, successful status updates during contact outages, visible warnings, and recovery after the RPC becomes available. Run `npm test` for the current result.
- `npm audit --omit=dev`: no known production dependency vulnerabilities reported at review time.
- `scripts/verify-review-database.cjs` passed against an isolated PGlite PostgreSQL runtime (0.5.8), with stubbed Supabase auth claims. It applies all setup scripts twice, verifies existing profile preservation, and runs rollback-based order/RLS/contact-access checks. It is not a live Supabase/PostgREST or browser test.
- GitHub Actions now runs application and isolated database checks.

## Remaining production scope

### Medium-priority follow-up

- Checkout conflict responses now distinguish `CHECKOUT_ALREADY_SAVED` from `MENU_CHANGED`. The browser preserves that code and looks up the original request before refreshing prices. A saved order is confirmed with a notice that retry edits were not applied. A missing saved-order result or failed lookup preserves the request ID and reports uncertainty instead of creating a replacement order.
- The Render Blueprint sets `TRUST_PROXY_HOPS=1` for the assumed standard single ingress. Existing manually configured services require the Dashboard setting separately. A local HTTP regression test verifies independent client buckets and that adding a spoofed leftmost forwarded address cannot reset an exhausted bucket. Actual Render ingress remains a release verification step; this test does not prove its topology.
- The previous compatibility fix already prevents failed contact enrichment from reporting a successful order update as failed.
- No live configuration, database policies, or deployments were changed by this follow-up.

Real payments, delivery dispatch, notifications, backup infrastructure, and monitoring remain separate production projects, not part of these regression fixes. Browser/device testing and a staging Supabase verification remain required before release.
