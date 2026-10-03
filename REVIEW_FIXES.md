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

## Deployment gate — do not deploy the application alone

The updated staff API requires `public.order_contacts`. Old application versions use `SELECT *`, which will fail after column protection is applied. Coordinate database setup and application deployment in a maintenance window; do not leave either version mismatched.

1. Back up the database and test on a staging project first.
2. Existing installations: run the updated `supabase/orders-setup.sql` as the database administrator. This is a repeatable setup script, not an automatically applied CLI migration. It preserves existing orders and does not assign roles.
3. Deploy the matching application revision.
4. Run `supabase/orders-verification.sql` in staging. Its sample order changes roll back; it needs two auth users and an available menu variant.
5. Verify real customer checkout/recovery, staff contact access, kitchen preparation/readiness, and direct API denial of the customer column.
6. Confirm the host's proxy topology before setting `TRUST_PROXY_HOPS` (for a verified single trusted ingress, use `1`). Test that different clients have independent rate-limit buckets and that forged forwarded addresses cannot bypass the ingress. Keep `0` for direct local access.

No live database policies, hosting settings, or role assignments are changed by editing these files. Refresh sessions after role changes; JWT role claims may remain valid until expiry.

## Verification performed

- `npm test`: 49 tests passed, including kitchen rendering without contacts, checkout recovery, focus preservation, catalog boundaries, proxy configuration, and cross-account cart clearing.
- `npm audit --omit=dev`: no known production dependency vulnerabilities reported at review time.
- `scripts/verify-review-database.cjs` passed against an isolated PGlite PostgreSQL runtime (0.5.8), with stubbed Supabase auth claims. It applies all setup scripts twice, verifies existing profile preservation, and runs rollback-based order/RLS/contact-access checks. It is not a live Supabase/PostgREST or browser test.
- GitHub Actions now runs application and isolated database checks.

## Remaining production scope

Real payments, delivery dispatch, notifications, backup infrastructure, and monitoring remain separate production projects, not part of these regression fixes. Browser/device testing and a staging Supabase verification remain required before release.
