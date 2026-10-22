# Customer UI refresh

## Kitchen merchant workflow — 2026-10-23

Kitchen staff enter To prepare (accepted orders), with direct Preparing and Ready queue buttons. The supplied merchant screenshots inform white order surfaces, green primary actions, large order references and readable item lists. Existing status dropdown retains access to other states. Start preparing and Mark ready use server-approved transitions and order versions; staff acceptance precedes kitchen preparation. Actual elapsed age is shown, with no invented countdown, driver state, scheduled-order support or photo workflow. This scoped kitchen treatment preserves other workspace roles and customer pages. Queue and role tests pass; live deployment and responsive browser verification remain outstanding.

## Business contact — 2026-10-18

The public landing contact section uses details supplied on the owner's business-card photo: Kathy's Hub; events place, grazing tables and cafeteria; kathyshub08@gmail.com; 0960-2617-352; 8165 Dr. A. Santos Ave., Parañaque City. Metro Manila/nearby-provinces coverage is presented as event inquiries, never a delivery guarantee. Mobile-first contact links have 48px minimum height and wrapping; desktop pairs service context with contact details. Payment help links to /#contact and asks for an order reference, never payment secrets. No hours, booking confirmation, refund promise, database change or deployment was added. Thirteen targeted contact/landing/payment tests pass; final responsive visual verification remains pending.

## Photo framing — 2026-10-18

Menu photos now fill a consistent 4:3 frame with object-fit:cover, replacing letterboxed contain rendering. Per-photo data attributes select reviewed focal positions: drinks emphasize the lower part of portrait originals, while cookies and pizza center their products. Originals and optimized assets remain unchanged; this is nondestructive presentation cropping, without stretching. Applies to primary and additional views on customer/admin cards. Ten focused regression tests pass, including crop CSS and photo attribute checks. The current local browser attempt timed out, so final mobile/desktop crop confirmation remains outstanding. No deployment or ordering changes.

## Real menu photos — 2026-10-18

13 named user-supplied Drive photos map explicitly to 10 products by section and name. Shared customer/admin cards use local 400/800px-wide WebP assets, lazy loading, descriptive alt text and broken-image hiding. Additional views stay under native More photos disclosures on the same card; no duplicated products. Full supplied framing is preserved. Camera filenames remain unassigned pending identification. No database, price, permissions or payment changes. See MENU_PHOTOS.md for mapping and maintenance. Desktop and 390px synthetic browser checks showed product images loading and no horizontal overflow at 390px; real-device verification remains outstanding. Local only, not deployed.

## Menu language — 2026-10-13

Search labels now visibly name the active group; result counts name the selected section when narrowed and use item/items correctly. Clear filters explicitly returns to the full menu. Empty catalog, no search matches and loading failure use distinct guidance; the retry action is Retry loading menu. Accessible search names match visible labels. No filter, cart, ordering or payment rules changed. Targeted menu/landing tests pass; mobile/zoom visual verification remains outstanding after earlier local preview timeouts.

## Menu grouping — 2026-10-13

The public menu uses four persistent controls: All, Food, Drinks and Desserts, mapped to existing all/bites/coffee/sweet values without database changes. Bingsu remains Desserts. The native section picker is available on phone and desktop, scoped to the selected group. Changing groups resets the section only. Search stays within the group; its accessible label, placeholder and results communicate scope. Empty filtered results offer Clear filters, resetting group/section/search and focusing search. Promotional section entry selects the matching group when unambiguous. Portion selections and cart contents survive changes; unknown categories remain under All. Prices, guest browsing, authentication and payments are unchanged. Four 48px-minimum targets use a mobile-first grid. All 130 tests pass; mobile/desktop visual verification remains pending because the local preview timed out. Not deployed.

## Customer tracking hardening — 2026-10-13

Order history now checks every 15 seconds while visible and offers a 48px-minimum Refresh orders action with a last-successful-update time. Background reads pause while a card has focus or history is expanded; a response arriving during interaction is deferred rather than replacing working content. Identical responses do not rebuild cards. Failed reads preserve the last loaded page and timestamp, with a direct retry; failed pagination does not claim a new page. Reads serialize, modern browsers apply a 15-second request timeout, rate limiting pauses automatic checks until explicit retry, and permission loss/account changes/page exit clear private content and timers. Cancellation is serialized against refreshes. No payment processing, database policy, deployment or restaurant-contact changes were made. Automated tests pass; the local browser preview was unreachable, so responsive visual confirmation remains outstanding.

- `/` is a public, mobile-first landing page with illustrated hero, category shortcuts, the full live menu, and a short restaurant introduction.
- `/signin.html` is authentication-only (sign-in, registration and recovery). It returns to an allowlisted `next` destination, defaulting to `/#menu`. Old email callbacks at `/` forward their query/fragment to sign-in. No authentication settings or database permissions changed.
- Account and checkout share `customer-theme.css`; the landing page uses `restaurant.css`. All customers use the same public menu and rendering/filter/cart modules. Account links remain visible on phones; authenticated customers see sign-out and admins see an admin link.
- Checkout links to `/account.html?from=checkout`; that page provides direct return links to checkout. Its sign-in link preserves the full account return context. Saving an address does not silently submit an order.
- Cart stays in the same tab across pages; the public cart launcher appears only after an item is added. Checkout requires sign-in as before, with an explicit sign-in link.
- Hero art is lightweight CSS illustration, not a photograph of the restaurant. Add approved product/interior photography and verified location/hours later. No invented ratings, reviews, opening hours or delivery promises were added.
- Check at 320px, 390px and desktop widths; keyboard navigation and reduced-motion settings are supported. Run `npm test` for regressions.

Local frontend changes need committing/pushing and deployment before they appear on Render.

## Maya sandbox payment page

`/payment.html?order=<uuid>` continues a saved Maya test order with a single-column, mobile-first layout using the existing cream/navy/burgundy theme. Its controls distinguish opening the hosted test checkout from verifying the result. Sign-in preserves only the validated local order link; return query parameters never imply success. The option is hidden until server configuration enables it. All states disclose sandbox-only money, and staff actions wait for server/database verification. See `MAYA_SANDBOX.md` for activation and test limitations. This addition does not deploy or enable live payments.

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

## Payment hardening — 2026-10-12

Payment checks preserve visible controls and saved status during requests. Native buttons are disabled temporarily; the hosted-checkout link is guarded with an announced disabled state. Focus returns only when it has not moved elsewhere. Confirmed payment promotes Track my order, distinct from restaurant acceptance. Visible pending/creating/review pages check at most eight times, 15 seconds apart; hidden pages pause and sign-out/page exit stop checks. Rate limiting ends automatic checks. No new payment is started automatically.

Missing checkout links show explicit saved-order management/cancellation guidance, not a guessed URL or blind retry. This does not restore a lost provider link or introduce session-only cancellation. Colors, typography and single-column layout remain unchanged. Browser inspection of the updated local fixture timed out; source and automated behavior verification are not real-device approval. No deployment or live database changes.

## Payment language — 2026-10-12

Impeccable clarify preserves payment behavior and sandbox disclosures. Maya selection changes the checkout action to **Save order & continue to test payment**, not Pay now. **Resume Maya test checkout** resumes an existing checkout; **Try payment again** requests a safe retry for the same saved order. Payment cancellation is not restaurant-order cancellation. **Test payment verified** is not real money received or restaurant acceptance. Customer history uses readable payment labels rather than internal status identifiers. The payment page keeps the no-real-money warning visible and puts published test credential/privacy guidance in a native disclosure. No live deployment.

## Direct Maya handoff — 2026-10-12

Implements the approved shape brief in the existing customer visual system (Operate). A fresh Maya checkout follows Checkout → Save order → Maya → Payment confirmation → Track my order. The action is **Save order & continue to Maya**. Saved items/total remain reviewable before submission; after saving, the form is hidden and a focused, announced **Order saved. Opening Maya test checkout…** state replaces it. There is no intermediate continue-button tap.

Only a pending server response with an allowlisted HTTPS sandbox destination can redirect externally. Missing/invalid destinations, already-paid states and errors fall back to the owned payment page. Reload and duplicate-order recovery never start payment automatically. The handoff issues at most one start request per saved order per page, never retries an uncertain POST, and suppresses late navigation after sign-out or page exit. The request recovery identifier stays until navigation; only the random identifier/owner are retained, never customer or payment details. Existing server idempotency and payment safeguards remain authoritative. COD/simulated flows are unchanged. This is local work, not deployment or real-money activation.
