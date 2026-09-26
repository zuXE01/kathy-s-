# Customer UI refresh

- `/` is a public, mobile-first landing page with illustrated hero, category shortcuts, the full live menu, and a short restaurant introduction.
- `/signin.html` retains the existing registration, recovery, member dashboard and admin link. Old email callbacks at `/` forward their query/fragment to sign-in. No authentication settings or database permissions changed.
- Account and checkout share `customer-theme.css`; the landing page uses `restaurant.css`. Public menu and member menu use the same rendering/filter/cart modules.
- Cart stays in the same tab across pages; the public cart launcher appears only after an item is added. Checkout requires sign-in as before, with an explicit sign-in link.
- Hero art is lightweight CSS illustration, not a photograph of the restaurant. Add approved product/interior photography and verified location/hours later. No invented ratings, reviews, opening hours or delivery promises were added.
- Check at 320px, 390px and desktop widths; keyboard navigation and reduced-motion settings are supported. Run `npm test` for regressions.

Local frontend changes need committing/pushing and deployment before they appear on Render.
