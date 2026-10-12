# Sandbox payment reliability — 12 October 2026

## Scope and status

Local implementation, not a live deployment. COD and simulated payments remain unchanged. Real-money payment processing, voids and refunds are deliberately not enabled. A paid closed order is an investigation case, not evidence of a refund.

| Finding | Implementation |
| --- | --- |
| Cancellation | Provider cancellation and authoritative retrieval before closure; paid/uncertain orders cannot be silently cancelled. Closed paid orders remain visible. |
| Missed confirmation | Durable reconciliation jobs, a bounded recovery worker every minute while the server runs, and an opt-in independent scheduled workflow. |
| Interrupted creation | Attempt history preserves uncertain POSTs. Lookup by reference recovers existing sessions. An explicit validation rejection is distinguished from a timeout/404/5xx; unknown creation is never blindly retried. |
| Slow webhooks | Trusted-source callbacks enqueue a reference in durable storage and acknowledge without contacting Maya. Separate webhook rate limit, atomic leases, revision-aware acknowledgements, backoff and visible dead letters. |
| Investigation | Owner/platform-admin/staff Payments tab: amount, order/status/reference, attempt count, last successful verification, recovery/duplicate-payment warnings and audit history. Recheck only asks Maya; there is no mark-paid API. Kitchen/customer access is denied. |
| Audit | Append-only server-granted audit events for claims, creation results, cancellations, successful verifications and verification failures. No raw webhook/provider body, buyer details, addresses, credentials or card information stored in audit. |
| Multiple attempts | Same saved order, separate unique attempt references, one active attempt enforced by a partial unique index and order-row lock. Explicit retry rechecks the previous attempt and uses an expected attempt ID. Ten-attempt safety limit. Old successes are retained and trigger cancellation of a newer unpaid attempt. |

## Activation order

1. Back up and test on staging. Apply existing order setup, `supabase/maya-sandbox-setup.sql`, `supabase/maya-cancellation-setup.sql`, then `supabase/maya-reliability-setup.sql`. Setup is repeatable and backfills existing payment rows into the attempt ledger. Do not execute test fixtures against live Supabase.
2. Deploy the compatible application with `MAYA_RELIABILITY_ENABLED=false`. Once SQL is installed, pause ordering during cutover, stop old writers, set `MAYA_RELIABILITY_ENABLED=true` on every application instance, and restart/deploy them together. Do not run mixed legacy/reliability writers or revert to the legacy writer after new attempts exist. Keep the same merchant credentials on the web server and scheduled worker.
3. Verify one sandbox checkout, customer retry, provider cancellation, staff investigation, unauthorized API denial and durable job processing on staging before reopening ordering. SQL rollback is not an appropriate production recovery strategy once new attempts have been written; retain this compatible release.
4. For independent recovery while free Render sleeps, configure the included GitHub Actions workflow on the default branch. Add repository secrets `KATHYS_SUPABASE_URL` and `KATHYS_SUPABASE_SECRET_KEY`; add variable `KATHYS_APP_BASE_URL` with the deployed HTTPS origin. For a private sandbox merchant also set `MAYA_SANDBOX_PUBLIC_DEMO=false` as a repository variable and add secrets `KATHYS_MAYA_SANDBOX_PUBLIC_KEY` and `KATHYS_MAYA_SANDBOX_SECRET_KEY`. Never paste keys into chat or commit them.
5. After setup is verified, set repository variable `MAYA_RECOVERY_ENABLED=true` and use the workflow's manual run once. Inspect its result before relying on scheduled runs. This local change does not configure repository secrets or activate the schedule. GitHub schedules can be delayed and have account/repository limitations; they are recovery assistance, not a real-time guarantee. A dedicated always-on worker is the production alternative.

`npm run payments:reconcile` runs one bounded pass directly against the configured database and provider; it does not rely on browser sessions or wake the Render website. The server also performs a pass on startup and every 60 seconds without overlapping passes. Shared database job leases coordinate concurrent workers. Shutdown stops scheduling new passes; in-flight jobs recover after lease expiry.

## Operational rules

- Pending/creating/review attempts remain eligible for recovery. Failed/cancelled/expired attempts receive hourly checks for seven days to catch late success. Beyond that horizon use staff Recheck with Maya or merchant investigation; this is not an unlimited settlement-reconciliation system.
- Twelve failed job executions move a job to visible attention/dead-letter state. Staff recheck requeues all attempts and verifies the current one. Retries back off up to an hour; database/provider outages cannot be treated as payment failure.
- A provider 404 or an empty lookup is NOT proof that creation never happened. Unknown attempts keep the order under investigation. Do not offer a manual reset or create another charge just to clear the screen.
- HTTP 400/422 from the creation endpoint is recorded as rejected creation; malformed local data, ambiguous responses, authorization errors and other failures remain unknown. Fix the underlying issue before retrying.
- A late old success makes the order paid even when its newer attempt is unpaid. The worker attempts to close the newer unpaid session; a race can still yield two successful test payments. Staff see the paid-attempt count and a duplicate-payment warning. Real money requires merchant-supported void/refund flows and settlement reconciliation before activation.
- Webhook source checks still depend on verified proxy topology. Public sandbox merchant webhooks must not be registered or altered; periodic recovery is the fallback for shared-key testing.
- Webhook limits are separate from customer API limits, but remain per-process. Shared distributed rate limiting and ingress monitoring are still production infrastructure work.
- Payment and audit history are restricted to the server; the staff API exposes a safe projection. There is no endpoint to assign payment success, delete audit events, or refund money.

## Verification

The application tests include isolated PostgreSQL-backed tests of real reliability RPCs and service logic: concurrent claims/retries, no-return success recovery, uncertain creation, explicit rejection, late old success, cancellation tombstones, leased jobs/duplicate acknowledgement, dead-letter failures and privileged-data access denial. The existing database repeatability script also installs the new setup twice. These do not substitute for live Supabase/PostgREST, actual merchant webhooks, GitHub scheduling, or real-device verification.

The staff extension preserves the existing cream/navy/burgundy palette, typography, order-card layout and customer checkout styling. Source review found and resolved two issues: attention filtering now occurs before pagination, and failed page/filter requests retain the last displayed state. The reviewer scored both fixes resolved at SOURCE-ONLY scope. Browser previews at localhost and 127.0.0.1 timed out; the Impeccable engine/detector was unavailable, so rendered mobile/desktop appearance remains unverified. No raster assets were created and no visual-system replacement was made.
