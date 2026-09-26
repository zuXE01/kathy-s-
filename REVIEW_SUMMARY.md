# Kathy's Hub — folder review

Reviewed: 26 September 2026. Scope: current local `kathysProject`, including account details, saved orders, customer order history, cancellation, and the frontend page-entry refactor.

## Overall assessment

A well-separated authentication and member-dashboard demo, not a complete restaurant management system. The earlier unsafe local password-reset endpoint has been removed. The most important remaining work is reliable profile storage, recovery/session edge cases, and end-to-end testing.

## What was reviewed

| Area | Files and purpose |
|---|---|
| Page and styling | `public/index.html`, `public/styles.css`: login, registration, recovery, dashboard, responsive layouts, cream/red/indigo theme |
| Frontend modules | `public/app.js` and all 12 files under `public/js/`: initialization, callbacks, Supabase client, forms, session handling, navigation and menu filters |
| Backend | `server.js`, `server/app.js`: Express startup, static files, public configuration, protected account endpoint, security headers and health check |
| Database | `supabase/schema.sql`: profiles table, ownership policies, new-user trigger and existing-user backfill |
| Deployment/configuration | `render.yaml`, `.env.example`, `.gitignore`, `CNAME`, package manifest and lockfile structure |
| Documentation/tests | `README.md`, `test/auth.test.cjs`, `test/server.test.cjs` |

The logo asset was inventoried, not visually reassessed. Installed third-party source under `node_modules` and Git internals were not manually audited. Secret values in `.env` were not displayed. Live Render deployment, SMTP delivery, installed database policies and the saved email-confirmation setting were not verified in this local review.

## Strengths

- HTML, CSS and feature logic are separated; the entry point only initializes modules.
- Feature modules use error-first callbacks around Supabase operations.
- Supabase handles passwords and sessions; the app does not maintain its own password database.
- `/api/me` verifies bearer tokens with Supabase instead of trusting submitted user details.
- Only the publishable key is exposed through configuration; a public publishable key is expected, not a leaked secret.
- Helmet supplies security headers. User-facing profile text uses `textContent`, reducing HTML injection risk.
- SQL enables row-level security and includes ownership checks for reads and updates.
- Responsive breakpoints, input labels, status announcements and dashboard keyboard-focus styles are present.
- Menu, reservations and rewards are honestly labelled as samples or coming soon.
- Git does not currently track `.env`, SQLite files or installed dependencies.

## Findings and recommended improvements

1. **Resolved — Invalid birthday data can abort signup.** Client validation and the safe `try_profile_date` database helper now reject impossible new birthdays and convert malformed existing metadata to `NULL`.

2. **Medium — Two competing profile stores.** The trigger copies metadata into `public.profiles` only when an account is created, but the dashboard and `/api/me` read Auth metadata. Profile-table edits will not appear there, and metadata edits will not update the table. Choose one authoritative profile source and define synchronization deliberately.

3. **Medium — Schema setup is not repeatable.** The table creation is conditional, but policy creation is not. Running the script again fails on existing policy names. Explicit table grants are also absent, so Data API access depends on project defaults. Use versioned migrations and explicit minimum privileges. Review the privileged trigger's schema, search path and execution permissions; this review does not establish an exploitable privilege escalation.

4. **Medium — Recovery state can become stale.** `session.js` clears session storage on `SIGNED_OUT`, but the `recovering` variable in `password-reset.js` is reset only by that module's own completion paths. An external/cross-tab sign-out during recovery can leave automatic session handling suppressed until reload. Reset all recovery state whenever sign-out occurs.

5. **Resolved — Display code assumes metadata types.** Dashboard display names now normalize non-string metadata before trimming.

6. **Security configuration to verify — password length and abuse protection.** The 12-character rule is enforced in browser code, which can be bypassed. Match it in Supabase's server-side password policy. There is no application rate limiter on `/api/me`; review provider limits and add suitable abuse protection before public use. This does not mean Supabase has no built-in limits.

7. **Demo limitation — email ownership and recovery.** Disabling confirmation allows immediate signup but does not prove ownership. Password-reset email still needs working delivery. The latest saved cloud confirmation setting remains unverified; local code supports immediate signup when Supabase returns a session.

8. **Testing and usability gaps.** Add real browser tests for immediate signup, restored sessions, cross-tab logout, expired recovery links and phone layouts. Use email input types, validate trimmed names and sensible birthdays, and consider making birthday/gender optional for a demo. Several labels are very small and deserve a contrast/readability check.

9. **Documentation/deployment cleanup.** README still lists email confirmation as a feature. `CNAME` names `kathystest.com`, while README names a Render address; this file alone does not configure a Render custom domain. Clarify the intended URL and demo settings. Remove unused `.success-view` styles when convenient.

## Verification results

- Ran `npm test`: **37 tests passed, 0 failed**.
- Tests cover callback behavior, mocked Supabase login/signup/recovery and HTTP access restrictions.
- These tests do not demonstrate actual email delivery, real-user recovery, live RLS isolation or production deployment correctness.
- Dependency versions are pinned and represented in the lockfile. A fresh online vulnerability audit was not run during this review.
- Existing uncommitted changes in `public/index.html` and `public/js/register.js` were preserved.

## Suggested order

1. Verify the demo's actual Supabase confirmation setting.
2. Harden profile parsing and make database setup repeatable.
3. Choose one profile data source and reset recovery state reliably.
4. Expand browser and database-isolation tests.
5. Before real customers: configure SMTP, enable email verification, review abuse protection and document privacy/data retention.
