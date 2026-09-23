# Demo checkout

Open the member cart and select **Continue to checkout**. The separate `/checkout.html` page supports customer name, email, phone, Philippine delivery address, notes, cash on delivery, and simulated online payment.

This is a frontend demonstration, not an order-processing system. Neither payment choice creates a database order, books delivery, sends an email, or charges money. COD is shown as unpaid; online success is explicitly simulated. Do not enter card credentials or OTPs. Delivery is displayed as ₱0 for demo purposes only.

Cart products are stored in this browser tab's session storage to survive navigation and refresh. Sign-out and successful demo confirmation clear the cart. Customer information is only held in the form and confirmation DOM; application code does not persist or transmit it. Use sample information. Checkout does not require an additional login check because it has no privileged or persistent operations.

Checkout resolves product IDs and option labels against the current public menu, ignoring stored names and prices. It rechecks before confirmation and requests review if prices changed. Missing products/options and invalid quantities are rejected. This browser validation is not a security boundary: real checkout requires authenticated server-side validation, durable orders, idempotency, delivery pricing, and verified payment-provider callbacks.

Modules: `cart-storage.js` handles navigation storage; `checkout-model.js` handles totals and validation; `checkout.js` handles page interaction. Styles are mobile-first in `checkout.css`.

Verification: 19 automated tests pass. Browser fixture checks cover COD, simulated online payment, clearing after confirmation, empty-cart handling, and 320px/390px layouts. No real customer data or payment provider was used. Changes must be deployed before appearing on Render.
