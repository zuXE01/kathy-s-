# Customer UI refresh

- `/` is a public, mobile-first landing page with illustrated hero, category shortcuts, the full live menu, and a short restaurant introduction.
- `/signin.html` is authentication-only (sign-in, registration and recovery). It returns to an allowlisted `next` destination, defaulting to `/#menu`. Old email callbacks at `/` forward their query/fragment to sign-in. No authentication settings or database permissions changed.
- Account and checkout share `customer-theme.css`; the landing page uses `restaurant.css`. All customers use the same public menu and rendering/filter/cart modules. Account links remain visible on phones; authenticated customers see sign-out and admins see an admin link.
- Checkout links to `/account.html?from=checkout`; that page provides direct return links to checkout. Its sign-in link preserves the full account return context. Saving an address does not silently submit an order.
- Cart stays in the same tab across pages; the public cart launcher appears only after an item is added. Checkout requires sign-in as before, with an explicit sign-in link.
- Hero art is lightweight CSS illustration, not a photograph of the restaurant. Add approved product/interior photography and verified location/hours later. No invented ratings, reviews, opening hours or delivery promises were added.
- Check at 320px, 390px and desktop widths; keyboard navigation and reduced-motion settings are supported. Run `npm test` for regressions.

Local frontend changes need committing/pushing and deployment before they appear on Render.

## Responsive adaptation — 2026-10-09

### Kitchen queue workflow

Kitchen accounts open the active order queue after server-verified role discovery. Active statuses (pending, accepted, preparing, ready) are filtered and sorted oldest-first before pagination; completed/rejected/cancelled views and All orders remain newest-first history. Cards show preparation quantities/portions and elapsed time since receipt, not a delivery estimate. Only server-approved forward actions appear on cards; rejection/cancellation and notes remain in details. Status history in details is collapsed.

The visible staff queue checks for updates every 15 seconds without overlapping reads. It defers updates while an order dialog is open or a queue card has focus, pauses reads when the page/panel is hidden, and clears its timer on sign-out or page exit. Errors retain background cards and the last successful update time, with explicit manual refresh. Existing server role checks and version conflicts remain authoritative. No new database policies or payment/delivery integrations were added.

- Phone history pagination uses a three-track grid that shrinks within the content area; wider layouts restore compact inline controls at 640px.
- Phone staff navigation wraps into two columns without hiding role-permitted sections. Sign out stays in document flow instead of overlapping the brand. Desktop sidebars scroll independently when vertical space is short.
- Cart and order dialogs keep their close controls visible while their contents scroll, with dynamic viewport-height limits and a conventional viewport fallback.
- Contact fields stack on phones and pair at 640px. Short landscape screens disable sticky address/summary actions that could obscure fields.
- Menu hover decoration is limited to a fine pointer with hover support; section controls retain a 44px minimum target for touch.
- All 64 regression tests pass. The local browser preview timed out, so these layout changes still need visual confirmation at 320px, 390px, tablet, desktop and phone landscape, plus real-device keyboard testing. No deployment was performed.

## Shared design tokens

### Interface terminology

- Use **Sign in** for account access and **Create account** for registration actions.
- Guests can browse the menu, portions and prices. Sign-in enables adding to cart; do not imply prices or portion choices require membership.
- **Continue to checkout** opens the customer/address form; it does not save an order. **Place demo order** saves it for restaurant review.
- **Pending** means awaiting restaurant acceptance. **Ready** means preparation is complete, not that a rider is booked or delivery is on the way.
- **Saved details** fill future checkouts, not existing orders. **Online payment — demo** is simulated, not money received.
- Staff actions use verbs such as **Accept order**, **Start preparing**, and **Mark ready**. Status notes are customer-visible in order history.

`public/color-tokens.css` is the shared semantic layer loaded after each page stylesheet. Primitive palette values are defined first, then mapped to surface, content, border, action, focus, disabled-state, and typography roles. Page-specific styles may keep layout and component details, but repeated color and type intent should use these semantic roles.
