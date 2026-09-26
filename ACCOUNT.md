# My Account

Open `/account.html` from the menu's My account link. The page displays the sign-in email and existing birthday/gender, and saves a delivery contact name, phone, one default Philippine address, and optional delivery notes. Email, birthday and gender are read-only on this page.

Contact fields may be left incomplete until checkout (name is required). Clearing a field and saving removes its saved value. Checkout loads the saved contact details before showing the form, validates required fields on submission, and allows order-specific changes without overwriting the default. Account edits do not change existing orders. The delivery contact name is separate from the signup/display name.

## Database

Run `supabase/customer-details-setup.sql` once on a new environment after auth is configured. It creates `public.customer_details` with owner-only row-level security, length/format constraints and no anonymous access. This setup was applied to the connected project during implementation. Addresses are not stored in JWT metadata or browser storage. Existing order snapshots remain visible to restaurant admins as before.

Run `supabase/customer-details-verification.sql` to test own-account writes, cross-account isolation (including admins), invalid postal codes and anonymous access. It requires two existing users and rolls all test changes back without returning private details.

## Verification

`npm test` covers validation and checkout mapping. `node test/admin-preview.cjs` starts a loopback-only fake-data preview on port 3102; its in-memory contact endpoint is not mounted in production. Save sample details in My Account, return to the menu, add an item and open checkout. Verify that details are filled, editable, and unchanged in My Account after order-specific edits. Mobile layout checked at 320px and 390px.

## Existing security advisories (not introduced by this feature)

The connected project's advisor reports public execution grants on the existing `handle_new_user` signup trigger function and disabled leaked-password protection. These were not changed by this feature. See [function permission guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Frontend changes require committing/pushing and redeploying before they appear on Render.
