# Saved orders and admin order management

## What works

Signed-in customers submit checkout through `POST /api/orders`. Orders are stored in Supabase with customer name, contact details, address, notes, item/size/quantity snapshots, current prices, payment method, timestamps and status history. All orders remain explicitly marked as demo orders until real payment/delivery functionality is built.

Admin: open `/admin.html` → **Orders**. The default filter is Pending. Use **Refresh orders** for new arrivals, select a status filter, and open a card to inspect customer and item details. The list is paginated at 20 orders per page.

Allowed progression: Pending → Accepted → Preparing → Ready → Completed. Pending, Accepted and Preparing can instead be Rejected, with a required reason. Completed and Rejected are terminal. Each update records the actor, time and note. Concurrent edits use a version check, so stale changes fail rather than overwriting newer work.

COD stays unpaid; completing an order does not collect cash. Online payment remains simulated, never marked as real paid money. Delivery fee is ₱0 for the demo. No delivery booking, notifications, customer order-history page, refunds, inventory deduction or payment collection is added in this phase.

## Setup and deployment

The connected Supabase project has already received `supabase/orders-setup.sql`. For another database, run it after `schema.sql`, `admin-setup.sql` and `menu-catalog-setup.sql`. It is an additive, repeatable setup script, not a CLI migration-history entry. No new service-role key or environment variable is needed.

Code changes are local until committed/pushed and deployed to Render. Keep production ordering disabled as a business process until delivery pricing, abuse controls, payments, notifications and operational policies are ready.

## Data protection and integrity

- The server verifies Supabase users, rejects unsigned/anonymous sessions, and checks trusted app metadata for admin actions.
- Database row-level security permits customers to read their own orders only; admins can read and progress all orders.
- Column grants restrict writes, and invoker triggers in a non-public schema enforce totals, available products, valid options, quantities and legal status transitions even for direct database API calls.
- Menu rows are locked while creating each snapshot. Changes to menu names/prices later do not rewrite saved orders.
- Prices are calculated in integer centavos. A mismatch requires the customer to review the updated total.
- A request UUID and unique user/request constraint prevent duplicates on retries. The same UUID with different checkout details is rejected. A page reload can recover a saved request whose response was lost.
- Customer details are now saved in the database and shown only to the owner/admin; the page explicitly discloses this before submission. The browser stores the cart and request ID, not the customer's address form.
- Orders cannot be deleted through this UI/API. Account deletion is restricted by the order foreign key; define a retention/anonymization process before real customer use.
- No customer contact details are placed in URLs or application logs.

## Verification

25 automated tests cover existing functionality plus order validation, authentication, customer isolation, retries, concurrent duplicates, price changes, status filters, rejection reasons, and stale admin updates. `supabase/orders-verification.sql` tests actual database policies, snapshot repricing and transitions inside a rolled-back transaction. It requires two existing users; no sample orders remain after the test.

The loopback-only browser fixture verified checkout → admin queue → Accepted → Preparing → Ready → Completed, including persistence across page reload and 320px/390px screens. Fixture data is in memory and never sent to the real database.

Database advisors reported no new order security warnings. Existing warnings remain for [anonymous signup-trigger execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated signup-trigger execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Existing profile/menu policy performance notices remain. New order indexes are naturally reported unused until real workload arrives.
