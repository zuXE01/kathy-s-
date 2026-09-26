# Customer UI refresh

- `/` is a public, mobile-first landing page with illustrated hero, category shortcuts, the full live menu, and a short restaurant introduction.
- `/signin.html` is authentication-only (sign-in, registration and recovery). It returns to an allowlisted `next` destination, defaulting to `/#menu`. Old email callbacks at `/` forward their query/fragment to sign-in. No authentication settings or database permissions changed.
- Account and checkout share `customer-theme.css`; the landing page uses `restaurant.css`. All customers use the same public menu and rendering/filter/cart modules. Account links remain visible on phones; authenticated customers see sign-out and admins see an admin link.
- Checkout links to `/account.html?from=checkout`; that page provides direct return links to checkout. Its sign-in link preserves the full account return context. Saving an address does not silently submit an order.
- Cart stays in the same tab across pages; the public cart launcher appears only after an item is added. Checkout requires sign-in as before, with an explicit sign-in link.
- Hero art is lightweight CSS illustration, not a photograph of the restaurant. Add approved product/interior photography and verified location/hours later. No invented ratings, reviews, opening hours or delivery promises were added.
- Check at 320px, 390px and desktop widths; keyboard navigation and reduced-motion settings are supported. Run `npm test` for regressions.

Local frontend changes need committing/pushing and deployment before they appear on Render.
