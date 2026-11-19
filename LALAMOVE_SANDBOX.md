# Lalamove sandbox delivery

Apply `supabase/lalamove-sandbox-setup.sql` after the orders setup. Configure the server variables listed in `.env.example` using sandbox credentials from the Lalamove Partner Portal. Use a public test pickup address and its coordinates, and a Philippine test phone in international format. Enable `LALAMOVE_SANDBOX_ENABLED` once configured.

Open a ready order as an owner or staff member. Expand **Lalamove sandbox delivery**, enter a public drop-off address and its coordinates, request a quotation, then confirm booking. Refresh or cancel the provider booking from the same order details. The fee is a sandbox estimate kept separate from customer checkout totals.

If booking is unconfirmed, check the sandbox Partner Portal before taking further action. Recover using the provider order ID once it is visible. The app verifies its quotation ID and blocks repeat booking while the outcome is unknown. Provider status is fetched on demand. Restaurant and delivery status are separate.

Provider reference: https://developers.lalamove.com/
