# Kathy's Hub UX critique and implementation guide

Review date: 2026-10-09 (Asia/Manila)  
Reviewed revision: `034d676`  
Scope: landing/menu, authentication, cart, account, checkout, customer history, staff overview/orders, menu management, and members.

This document turns the Impeccable critique into guidance for future AI contributors. It is a dated assessment: inspect current code and confirm a finding still applies before implementing it. No application fixes were made as part of creating this guide.

## Product direction

Preserve the cream, navy, and burgundy palette, editorial typography, familiar restaurant language, and mobile-first layout. Improve task continuity and staff efficiency before adding decorative motion.

Guests can browse the full menu, sizes, and prices. Authentication enables ordering. Do not restore the former membership-before-prices restriction without an explicit user request.

The customer should understand what was added, what will be ordered, and where to track it. Staff should understand what needs attention, how fresh the queue is, and the next action they can take.

Payments and delivery booking remain demo-only. Preserve clear disclosures and existing backend safeguards.

## How to use this plan

1. Read the relevant item and verify it against current implementation.
2. Work within the user's request. This backlog does not authorize implementing every item or deploying changes.
3. Preserve existing work and backend protections while improving the interface.
4. Verify the acceptance criteria and report concrete test/browser evidence.
5. Change an item's status from Open to Complete only when verified. Add the completion date, files changed, and verification. Use Partial when criteria remain unmet.

Priority definitions: P1 significantly affects the workflow; P2 causes friction with a workaround; P3 is polish. No P0 blocker was established in the critique.

## Priority backlog

### UX-01 — P1: Make order freshness visible

Status: Open

Staff queues and customer history refresh through explicit actions and can look current while becoming stale. Owner overview emphasizes catalog/member statistics rather than outstanding work.

Relevant files: `public/js/admin/orders.js`, `public/js/admin/main.js`, `public/js/pages/orders.js`, `public/orders.html`, `public/admin.html`.

Required outcome:

- Refresh in the background while the relevant page/panel is visible; pause unnecessary work when hidden or signed out.
- Prevent overlapping requests and stale responses from overwriting newer state. Clean up timers/subscriptions appropriately.
- Show last successful update and a useful refresh/retry action. Do not label failed refreshes as fresh data.
- Preserve displayed cards, focus, and open work during background refresh.
- Make pending work visible from the staff overview/navigation. Restrict counts and controls to the user's role.
- If notifications are added, make sound optional and avoid repeated alerts for the same order.

Acceptance: new orders/status changes become visible without full-page reload; hidden/signed-out views stop refreshing; failures remain recoverable; background refresh does not close a working dialog or steal focus.

Suggested Impeccable workflows: `harden`, `shape`.

### UX-02 — P2: Preserve customer choices across navigation

Status: Partial — 2026-10-09 hardening pass. Portion selections survive in-page catalog rerenders, and promotional section intent is consumed before asynchronous authentication. Checkout warns before discarding edits, without storing personal details. Cross-page portion persistence and explicit removed-option messaging remain open.

Expanding the menu recreates cards and resets selected portions. Guest initialization can prevent a saved promotional section from being applied after authentication. Visiting My account from checkout loses unsaved checkout edits.

Relevant files: `public/js/menu.js`, `public/js/menu-card.js`, `public/js/pages/landing.js`, `public/js/pages/checkout.js`, `public/js/pages/account.js`.

Required outcome:

- Keep selected variants by product ID, or append newly revealed cards without recreating existing ones.
- Restore promotional category intent independently of asynchronous authentication initialization.
- Preserve valid guest selections when ordering becomes available, while checking current availability and prices at checkout.
- Preserve checkout edits during the account round trip using a deliberate, privacy-conscious tab-local approach, or clearly warn before discarding edits.
- If retaining a draft, isolate it by account, clear it after sign-out/account switch/successful submission, and do not store secrets or payment credentials. Avoid retaining personal details longer than needed.
- Resolve stale products/options explicitly rather than silently selecting a different size.

Acceptance: select a nondefault portion, expand the menu, and add it without its size changing; follow a promotion through sign-in and return to that section; edit checkout, visit account, and return with the agreed preservation behavior; account switching cannot expose another customer's draft.

Suggested workflow: `harden`.

### UX-03 — P2: Make order tracking the next step after checkout

Status: Partial — 2026-10-09 hardening pass. Orders is no longer hidden on mobile, and confirmation makes View my orders primary. Narrow-screen browser verification and fuller status explanations remain open.

Orders is hidden from the landing header below 720px. The saved-order receipt offers Back to menu but no direct tracking action, although no email is sent.

Relevant files: `public/color-tokens.css`, `public/index.html`, `public/checkout.html`, `public/js/pages/checkout.js`, `public/orders.html`.

Required outcome:

- Keep Orders accessible in primary mobile navigation without horizontal page overflow.
- Make View my order or View my orders the receipt's primary follow-up; keep Back to menu secondary.
- Explain Pending as awaiting restaurant acceptance and clarify subsequent statuses.
- If linking to one order, enforce ownership and provide an actionable missing/unavailable-order state.
- Show estimates only when the restaurant can maintain them reliably.

Acceptance: at 320px and 390px, a customer can reach order history from primary navigation and directly from confirmation; tracking retains authentication context; demo disclosures remain accurate.

Suggested workflows: `adapt`, `clarify`.

### UX-04 — P2: Shorten the kitchen workflow

Status: Partial — kitchen queue implementation now includes server-paginated oldest-first active work, item summaries, role-approved direct actions, waiting time, collapsed history and direct kitchen entry. Automated verification is recorded below; real-browser/live validation and broader role-specific overview improvements remain outstanding.

Queue cards show item counts and totals; preparation details and status updates require opening a dialog. Actions appear after full details/history, and active work is ordered newest-first.

Relevant files: `public/js/admin/orders.js`, `public/js/admin/main.js`, `public/admin.html`, `server/orders.js`.

Required outcome:

- Show concise item quantities/portions on kitchen cards, without exposing customer contact details to kitchen staff.
- Provide the next permitted action directly, such as Start preparing or Mark ready.
- Derive visible actions from server-approved capabilities. Preserve server authorization, allowed transitions, rejection reasons, and optimistic version checks.
- Put active work in oldest-first order with stable pagination and visible waiting time; retain an appropriate history ordering for completed work.
- Collapse status history in details and keep operational actions easy to reach on phones.
- Make outstanding work prominent on role-specific home screens; consider opening the kitchen queue directly when implementing this item.

Acceptance: a kitchen user can inspect preparation items and advance an allowed order without a dialog trip; double taps cannot create duplicate updates; stale/conflicting updates recover clearly; kitchen accounts cannot view private contact information or perform forbidden transitions.

Suggested workflows: `shape`, `distill`.

### UX-05 — P2: Complete accessibility and component states

Status: Partial — 2026-10-09 hardening pass. Keyboard tabs, focus transfer, main landmark/headings, message associations, password retry invalid-state cleanup, and an explicit cart success token are implemented. Broader button-cascade cleanup and real-browser accessibility verification remain open.

Authentication uses tab semantics without the full expected keyboard/focus behavior. Password retry clears visible errors but leaves `aria-invalid`. Shared button background overrides suppress the cart success color.

Relevant files: `public/js/tabs.js`, `public/signin.html`, `public/js/register.js`, `public/js/login.js`, `public/color-tokens.css`, `public/cart.css`.

Required outcome:

- Implement the declared tabs' keyboard model, selected state, focus behavior, and active-tab tabindex; alternatively use appropriate ordinary controls consistently.
- Move focus meaningfully when a link hides its own panel and opens registration.
- Keep visible errors and accessibility attributes synchronized during retry/reset. Associate error guidance with the relevant fields.
- Add a meaningful main landmark and heading structure to authentication.
- Define success/error/disabled/secondary component states without blanket primary-color overrides. Keep written confirmation so color is never the only cue.
- Preserve visible focus, touch targets, and reduced-motion behavior.

Acceptance: complete auth switching/correction with keyboard only; focus never remains in hidden content; corrected/reset fields no longer announce stale invalid states; Added confirmation remains distinguishable in the final CSS cascade.

Suggested workflow: `audit`.

## Secondary improvements

All items below are Open. Implement only when relevant to the requested scope.

| ID | Improvement | Acceptance direction |
| --- | --- | --- |
| UX-06 | Group the 22 menu sections into understandable families | Food/Drinks/Desserts or another verified grouping reduces scanning while preserving named sections and search; mobile filtering remains available. |
| UX-07 | Replace menu variant delimiter syntax | Staff edit labeled portion/price rows with add/remove controls; preserve validation and explain calculated base price. |
| UX-08 | Remove irrelevant account presentation | Birthday/Gender placeholders no longer distract from contact/address tasks; do not delete historical database data as an incidental UI change. |
| UX-09 | Improve member retrieval and recovery | Provide direct retry; add server-backed search when needed for membership size, respecting permissions and pagination. |
| UX-10 | Centralize empty-cart visibility | Launcher appears for authenticated customers with cart contents; auth events cannot override empty-cart rules. |
| UX-11 | Clarify guest and registration copy | Explain that browsing sizes/prices is public and sign-in enables cart ordering; password mismatch supports direct correction. |
| UX-12 | Improve product recognition | Use approved photography/descriptions; add dietary/allergen facts only when verified. Do not invent product claims. |
| UX-13 | Improve empty states | Offer a direct menu action from empty history; avoid unnecessary disabled pagination prominence. |

## Preserve these strengths

- Public menu and price discovery with authenticated ordering.
- Honest demo payment/delivery messaging.
- Native dialogs, labeled fields, autocomplete, live feedback, and reduced-motion support.
- Saved address prefill and direct account-to-checkout return links.
- Pending cancellation, constrained status transitions, required rejection reasons, version conflicts, and saved-order reconciliation.
- Customer-contact privacy and account isolation.

## Verification and critique baseline

The critique used two independent source assessments and supplemental local browser checks. All 59 existing tests passed at the reviewed revision. Browser checks included mobile landing, account, and empty history; populated-order and checkout edge cases were source-backed. Real-phone behavior and live Render/Supabase behavior were not revalidated.

Impeccable's detector exited 127 without results because its engine was unavailable. This is an unavailable scan, not a clean scan. No detector overlay or helper-generated trend was produced.

Reviewer heuristic baseline (judgment, not automated measurement or accessibility certification):

| Heuristic | Score / 4 | Main concern |
| --- | --- | --- |
| Visibility of status | 2 | Freshness |
| Real-world language | 3 | Variant syntax |
| User control | 2 | Lost selections/drafts |
| Consistency | 2 | States and tabs |
| Error prevention | 3 | Selection reset gap |
| Recognition over recall | 2 | Tracking and hidden preparation context |
| Efficiency | 2 | Repetitive staff actions |
| Visual simplicity | 3 | Unnecessary content |
| Error recovery | 3 | Useful existing retries/reconciliation |
| Contextual help | 2 | Operational guidance |
| Total | 24 / 40 | Focused improvements needed |

Do not increase this score merely because tasks are marked complete. Reassess the actual experience after relevant changes.

## Completion record

### 2026-10-09 — Kitchen/staff queue implementation

- Implemented the approved shape brief in `public/js/admin/orders.js`, `public/js/admin/main.js`, `public/admin.html`, `public/orders.css`, and `server/orders.js`.
- Added Active queue as the default, with server-side filtering and oldest-first ordering before pagination. Terminal history stays separate. Kitchen entry opens Orders after verified overview role discovery.
- Preparation summaries, elapsed receipt age and permitted direct forward actions preserve server capability/version checks. Rejection still requires a reason in details; status history is collapsed. Kitchen API contact stripping remains unchanged.
- Added visible-queue polling every 15 seconds, read serialization, deferred filter/page requests, stale-result protection, dialog/focus preservation, last-success timestamps, recoverable refresh failures, and sign-out/page-exit cleanup.
- Updated the in-memory order adapter to model filtering/ordering; added `test/kitchen-queue.test.cjs` covering pagination, double clicks, conflicts, hidden/focused/dialog refresh, stale responses, failure preservation and missing capabilities.
- Verification: all 70 tests pass; whitespace check passes. No live Supabase query or new browser visual pass was performed; prior loopback browser timeouts remain unresolved. No schema/policy changes, deployment or production-readiness claim. UX-01 is partially addressed for the staff queue only; customer background refresh and outstanding-work overview improvements remain open.

### 2026-10-09 — Impeccable clarify

- Clarified public-menu/sign-in copy, password correction/cancellation consequences, cart-to-checkout timing, saved-address behavior, customer status meanings and staff status-action labels. Internal status values and authorization rules are unchanged.
- Added a Browse the menu link to empty history and distinguished an empty later page from a customer with no orders. Order history explicitly instructs reloading for updates; it does not imply automatic refresh.
- Files: `public/index.html`, `public/signin.html`, `public/account.html`, `public/orders.html`, `public/js/register.js`, `public/js/cart.js`, `public/js/pages/orders.js`, `public/js/admin/orders.js`, and history regression tests. Terminology recorded in `DESIGN.md`.
- All 65 tests passed, including customer pending/ready explanations and empty-history navigation. UX-03 remains Partial pending narrow-screen/browser verification; UX-11 and UX-13 have source-level improvements but no new visual verification. Previous local browser connection failures remain a verification limitation. Not deployed.

### 2026-10-09 — Impeccable adapt

- Responsive CSS changes in `public/orders.css`, `public/cart.css`, `public/admin.css`, `public/menu-cards.css`, and `public/customer-theme.css` address narrow pagination, overlapping staff sign-out, touch targets, short-screen dialogs, scrollable desktop sidebars and contact-field reflow.
- UX-03 remains Partial: mobile Orders navigation is retained and pagination sizing is improved, but browser confirmation at the required widths remains outstanding.
- All 64 tests passed after granting local test-network access. Browser preview returned `ERR_CONNECTION_TIMED_OUT`; no visual, real-device or cross-browser pass is claimed. Source changes only, not deployed.

### 2026-10-09 — Impeccable hardening

- UX-02, UX-03 and UX-05: Partial, as detailed above. UX-10's empty-cart auth override is fixed with regression coverage; full visibility ownership centralization remains open.
- Changed menu/card/landing/cart modules, authentication tabs/register/sign-in markup, checkout markup/controller, shared color tokens, and added `public/js/checkout-leave-guard.js`.
- Menu retry ignores duplicate in-flight loads and rejects malformed response envelopes. Long catalog/order text wraps; mobile controls have a 16px input floor. No backend permissions, payment behavior or database data changed.
- Added `test/ui-hardening.test.cjs` for option reconstruction, stale/invalid option safety, promotional intent, checkout discard protection, keyboard tabs, and empty-cart auth events. Updated existing confirmation/DOM fixtures for the new guard and cart metadata.
- Verification: all 64 tests passed; diff whitespace check passed. Browser preview could not connect to the loopback fixture (`ERR_CONNECTION_TIMED_OUT`), so responsive appearance, browser confirmation dialogs and real keyboard/screen-reader behavior remain unverified. Impeccable helper engine was unavailable; this is not a clean detector scan.
- Local changes only; not committed, pushed or deployed. UX-01 order freshness and UX-04 kitchen workflow remain open. This pass is not a production-readiness certification.
