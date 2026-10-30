# Order updates and menu inventory

Local implementation, 2026-10-30. Not applied to live Supabase or Render.

## Activate

1. Back up the database and rehearse on staging.
2. Apply existing order/Maya setup scripts first, then `supabase/stock-notifications-setup.sql` **last**. Reapply it after rerunning earlier order setup scripts.
3. Deploy the application. Without the migration, notifications and inventory show unavailable messages; existing order processing continues.
4. Sign in as owner. Open Menu manager. Each card has **Stock remaining (all sizes)** and **Save stock**. Enter a nonnegative whole count; clear it to disable tracking. All items initially have tracking off. Saving counts never changes menu visibility or prices.
5. Rehearse customer submission, staff acceptance, kitchen preparation/readiness and customer notification read state using separate browser sessions.

## Counting rules

- One count per menu product, shared across sizes/variants. A quantity of two reserves two units, regardless of portion size. This is finished-item inventory, not recipe/ingredient accounting.
- Stock is reserved on order submission, including unpaid Maya orders. All affected products are locked in a stable order and updated in the same database transaction. Insufficient stock rejects the whole order; duplicate order inserts roll back deductions.
- A pending cancellation or rejection from pending/accepted restores reserved stock once. Rejecting an order already preparing does not restore stock. Completed orders remain deducted.
- Unpaid/abandoned orders can hold stock until explicitly cancelled or rejected. No automatic expiry is introduced because payment cancellation must be verified first.
- Owner counts represent **currently available stock**, excluding existing reservations. Version checks reject outdated owner edits. No ingredient conversion, supplier purchasing, spoilage ledger or stock adjustment audit screen is included.
- Existing orders are not retroactively deducted. Enable tracking with a count that reflects current available inventory.
- Public menu cards do not show live remaining quantities in this version. The database is authoritative at submission; checkout reports a stock/menu conflict if availability changed.

## Notifications

Customer pages using customer-navigation show an Order updates panel. Status changes create persistent customer-owned records for accepted, preparing, ready, completed, rejected and cancelled states. The panel displays the latest 50 events and lets customers mark displayed events read. It checks every 15 seconds while visible, serializes requests, pauses on rate limiting and clears private UI on account changes. It does not send email, browser push, sound or alerts while the website is closed. No historical notifications are backfilled.

## Verification

`npm test`: 171 existing tests pass. `npm run test:database` also runs the new rollback verification: tracked deductions, insufficient stock rejection, exact cancellation restoration, stale edits, denied customer stock administration, customer notification isolation/read state and accepted/preparing/ready events. These checks use isolated PGlite, never the live database. Concurrent transactions and actual Supabase/PostgREST permissions still need staging verification. Headless Edge could not launch in this sandbox, so responsive visual verification remains outstanding.
