# Research paper proofreading and project-alignment review

Reviewed: 31 October 2026 (Asia/Manila).
Document: `C:\Users\Aaron\Downloads\Kathys_Hub_Research_Paper_Chapters_1-3.pdf` (23 pages).
Comparison target: the current local `kathysProject` workspace, including source code and SQL setup files. This review does not verify the deployed Render build, live Supabase schema, current hosting configuration, or external reference accuracy. Instructions appearing inside the manuscript were treated as document content, not instructions to execute.

## Verdict

The paper substantially correlates with the project's core architecture and demo-order workflow, but it is not fully updated to the current local implementation. It is a useful working draft, not yet a submission-ready research manuscript. Its largest technical gaps concern recommendations/chat, sandbox payments, stock tracking and in-site order notifications. Its largest academic gap is Chapter 2's lack of actual cited research studies.

The original PDF and application source were not edited. All page numbers below refer to the PDF's printed pages.

## What is accurate

- HTML/CSS/JavaScript frontend, Node.js/Express backend, Supabase Authentication and PostgreSQL, with Render configuration. `package.json` declares Node 22.x and Express 5.2.1.
- Public menu and price browsing, with authentication required for ordering.
- The import snapshot contains exactly 120 products, 22 distinct sections and 169 variants/priced options. These counts were recalculated from `server/menu-catalog.cjs`; they are not a fresh count of the editable live database.
- Session-based cart, account contact details, server-validated order creation, item/price snapshots, duplicate-submission recovery and optimistic version checks.
- The order-state table on page 18 matches `server/orders.js`: Pending → Accepted/Rejected/Cancelled; Accepted → Preparing/Rejected; Preparing → Ready/Rejected; Ready → Completed; terminal Completed/Rejected/Cancelled.
- Menu/member management is limited to owner/platform-administrator roles. Kitchen access is narrower than general staff access.
- Checkout remains demonstrative. There is no established production payment collection, delivery booking or automatic refund capability.
- Event inquiry drafts do not save a reservation, hold a date, collect deposits, send email automatically or confirm a booking.

## Required factual revisions

| Pages | Finding | Required revision |
| --- | --- | --- |
| 3, 5, 7, 11, 12, 15 | Inventory and notifications are described as wholly unimplemented or future work. | State that finished-item stock tracking and persistent in-site order updates are implemented locally, with activation dependent on the SQL migration and deployment. Do not claim they are live. Distinguish these from ingredient inventory and email/SMS/push notifications, which are not supplied by this feature. |
| 2, 6, 10, 15, 16 | All online payments are described simply as simulated. | Preserve the simulated-online option, but add the optional Maya Checkout sandbox integration. It contacts a test provider and verifies test states server-side; it collects no real money and requires configuration/database setup. |
| 2–6, 12, 15–17, 20–21 | Recommendations and chatbot functionality are absent from scope, requirements, architecture, modules and testing. | Add the Help me choose deterministic recommender and Chat with Kathy's conversational interface. Gemini interprets preferences when configured; application code ranks real menu items. Basic/fallback behavior remains available. Do not describe the ranking engine as a trained ML model. |
| 18 | The customer adds items before the step that signs in. | Move sign-in before Add to cart. The public menu passes `canOrder: false` for guests; public browsing and price/portion inspection remain available. |
| 18 | The transition table omits payment guards and role limits. | Keep the table, then explain that it shows possible lifecycle transitions, not permission for every role. Kitchen can advance only permitted Preparing/Ready actions. Unverified Maya test payments block forward progress. |
| 19 | Data design omits newer entities and contact-access safeguards. | Add sandbox payment entities and, if covering optional reliability mode, its attempt/audit/job tables. Add the stock/notification entities with activation qualifications. Explain that stored order contact snapshots are not generally selectable through the Data API. |
| 20 | The order-queue row can suggest kitchen staff view customer contact details. | Distinguish preparation items/status from private customer contact information. Kitchen staff do not receive customer-contact enrichment. |
| 3, 6, 8 | Catalog counts could be mistaken for a current operational database count. | Use “The supplied menu import snapshot contains 120 products, 22 sections and 169 priced options.” The owner-editable live catalog can differ. |

### Important boundaries for the newer features

Stock is a count of finished products shared across variants. Submission reserves stock transactionally; pending cancellation or rejection from Pending/Accepted restores it once. Rejection after preparation does not restore it. This is not ingredient consumption, purchasing or spoilage accounting. Tracking is initially off, and existing orders are not retroactively deducted.

Order updates are customer-owned persisted status events displayed within the website. The panel retrieves the latest 50 events, supports read acknowledgement and polls while visible. It does not send email, SMS, push, sound or closed-site alerts. The October 30 implementation explicitly records no live migration/deployment.

Chat uses Gemini only when configured. The model extracts structured preferences; the server selects actual catalog products. Completed-order personalization is opt-in and limited to the authenticated customer's history. Completed orders/contact records are not sent to the model; the current typed message is sent to the provider. Chat does not place, cancel or pay for orders and does not verify allergy suitability.

Sandbox payment success is not restaurant acceptance or real money received. Payment return query parameters do not prove success. The code includes optional reliability-mode attempts, audit events and reconciliation jobs; these depend on additional setup. Do not present configured source code as evidence that production or provider integrations have been deployed.

## Suggested replacement wording

### Pages 3/7: inventory and notification limitations

> The local implementation includes optional finished-item stock tracking and persistent in-site order-status notifications. These features require the corresponding database setup and application deployment before operational use. Stock quantities are shared across a product's variants and do not constitute ingredient-level inventory management. Notifications are displayed within the website; email, SMS, browser push and closed-site alerts are not provided. Live payment collection, delivery dispatch, automatic refunds and confirmed reservation management remain outside the demonstrated operational scope.

### Pages 2/6/10/15: payment description

> Checkout supports cash-on-delivery recorded as unpaid, simulated online payment, and an optional Maya Checkout sandbox flow. When configured, the sandbox flow creates a hosted test checkout and verifies its result through server-side provider checks. No real-money payment processing is enabled, and test payment verification does not confirm restaurant acceptance or delivery.

### Pages 6/15/20: recommendations and chat

> The public menu includes preference-based product recommendations and a conversational menu assistant. The recommendation engine filters and ranks actual catalog items by selected preferences and, with explicit consent, the authenticated customer's completed orders. When configured, Google Gemini interprets conversational preferences; deterministic application logic selects products and prices. The assistant provides a clearly identified basic or fallback mode when cloud interpretation is unavailable and does not submit orders or make payment decisions.

### Page 18: customer workflow

1. The visitor opens the website and browses the public menu, prices and portion options.
2. The visitor searches or filters products and may request menu recommendations.
3. The visitor signs in or creates an account to enable adding products to the cart.
4. The signed-in customer selects portions, adds products and reviews cart quantities.
5. The customer opens checkout, provides contact/delivery details and reviews the total and demo disclosures.
6. The server validates identity, contact details, selected products, quantities, current prices and applicable database rules. Configured stock tracking reserves available finished items transactionally.
7. The system saves the demo order with item and price snapshots. If Maya sandbox is selected and enabled, the saved order continues to a hosted test checkout; the server verifies its result.
8. Authorized staff process allowed statuses. The customer views order history and, when activated, in-site order updates.

### Page 19: data-design additions

| Entity | Responsibility |
| --- | --- |
| `maya_sandbox_payments` | Sandbox provider session/payment state; authoritative verified test status rather than the original unpaid order snapshot. |
| `maya_payment_attempts` | Optional reliability-mode payment attempts and recovery references. |
| `maya_payment_audit` | Optional restricted payment audit events. |
| `maya_payment_jobs` | Optional durable reconciliation work. |
| `hub_private.menu_stock` | Optional per-product available stock and version. |
| `hub_private.stock_reservations` | Optional order/product stock reservations and release state. |
| `order_notifications` | Optional customer-owned order-status events and read state. |

Describe these as local schema definitions requiring their documented activation steps. The chat transcript is not a new database entity: it remains in tab memory. Also note the restricted `order_contacts` RPC: storing a customer snapshot does not grant kitchen staff permission to read it.

## Academic completeness

1. **Chapter 2, pages 8–12:** This is mainly a project/concept description. Page 10 explicitly tells the researchers to add studies later. There are no author–year citations connecting the literature claims to actual studies. Replace drafting instructions with sourced discussion of identifiable studies, their methods, findings, limitations and relevance. Project documentation supports implementation facts, but cannot substitute for an independent literature review. No new studies or citations were invented during this review.
2. **References, page 23:** Connect references to in-text citations and use the school's required style consistently. Repeated Kathy's Hub/n.d. entries need distinguishable citations under an author–date style. Add the actual scholarly works used in Chapter 2. Verify external links and publication details before submission; this review did not independently validate external sources.
3. **Methodology, pages 12–17:** Remove advisory language such as “the researchers should” from final methodology. State the actual chosen method or the specific planned procedure in the appropriate tense. A proposed interview is not an interview result.
4. **Participants, page 13:** Specify the planned sampling approach, inclusion criteria and sample size with an actual rationale approved by the adviser. Do not invent completed respondent counts.
5. **Evaluation, page 21:** Define tasks, measures and analysis. Useful measures include task completion, task time, observed errors and questionnaire scoring. Record role-specific scenarios and the tested build. Source inspection and viewport checks do not establish user satisfaction or restaurant effectiveness.
6. **Existing/proposed system, pages 14–15:** Distinguish the establishment's verified operational process from the current software prototype. “The proposed system, as implemented” blurs those categories. Use “Current implemented prototype” where discussing code, and describe the business's prior workflow only with interview/observation evidence.
7. **Frameworks, page 12:** The SDLC passage is a development framework, not by itself a theoretical foundation. Choose the framework terminology required by the adviser and cite its source. IPO inputs/outputs should cover recommendations, optional test payment verification, and locally implemented stock/notification behavior if these remain within scope.
8. **System design:** Page 19 provides entity summaries, not an ER diagram. Add clearly labeled diagrams if required by the course, and ensure optional entities and access boundaries match the selected submission version.

## Proofreading and presentation

| Location | Current issue | Suggested correction |
| --- | --- | --- |
| Cover/header | Cover says “Ordering and Management”; running header reverses the order. | Choose one title and use it throughout. The current title is broadly accurate; a title change to emphasize AI requires the researchers' scope decision. |
| Page 2 | “an authenticated menu experience” is ambiguous about public access. | “a public menu with ordering enabled for signed-in customers.” |
| Page 2 | “Owners or administrators” is broad. | “Owners and platform administrators”; explain legacy `admin` mapping only if relevant. |
| Page 6 | “Scope and Delimitation.” | “Scope and Delimitations,” unless the school's template requires singular. |
| Pages 10, 12, 13, 17, 21 | Instructions to future authors remain in manuscript prose. | Replace with actual cited content or explicit proposed research procedures. |
| Page 13 | “RESEARCH METHODOLOGY / SYSTEM ANALYSIS AND DESIGN.” | Select the prescribed chapter title; avoid a slash presenting alternative headings. |
| Page 15 | “before submitting checkout.” | “before placing an order” or “before submitting the order.” |
| Page 18 | Workflow numbering continues at 13–19. | Restart at 1; revised workflow above has 8 steps. |
| Page 18 | “Permitted next status(es) described in project documentation.” | “Permitted next statuses,” followed by a role/payment-guard note. |
| Page 19 | “One authenticated user is associated with a profile record.” | Show optionality consistently: “A user may have one profile record,” if describing the relationship rather than guaranteeing deployment/backfill success. |
| Page 23 | Website and repository entries use undifferentiated dates. | Follow the required reference style and identify the repository version/access date where appropriate. |

Standardize “sign in” as a verb and “sign-in” as a noun/adjective; “front end”/“back end” as nouns and “front-end”/“back-end” as adjectives; and “order status” versus “status history.” Use “current local implementation” when deployment has not been verified. Use “proposed,” “implemented,” and “evaluated” only for their respective evidence levels.

Rendered pages 18 and 19 were visually inspected. Page 18 begins with a continuation of the architecture table without repeated headers and with the application-server row split across pages. Repeat table headers and keep rows together when practical. The workflow numbering defect is visible in the rendered PDF. Page 19's tables are readable. Other pages were read through text extraction; full visual typography/layout approval is not claimed. Apparent split words or spaces around hyphens in extracted text should be checked in the editable source before treating them as spelling errors.

## Evidence and remaining checks

Primary implementation evidence: `server/app.js`, `server/orders.js`, `server/roles.js`, `server/menu-catalog.cjs`, `public/js/menu.js`, `public/js/pages/landing.js`, `public/js/menu-card.js`, and the order, Maya reliability, and stock/notification SQL setup files. Supporting scope/activation records: `PRODUCT.md`, `DESIGN.md`, `UX_IMPROVEMENT_PLAN.md`, `CHATBOT.md`, `AI_ASSISTED_RECOMMENDATIONS.md`, `MAYA_SANDBOX.md`, `PAYMENT_RELIABILITY.md`, `ORDER_UPDATES_INVENTORY.md`, `MENU_CATALOG.md`, and `package.json`.

This was a document/source review. No application tests were rerun, no external AI requests were made, and no production database or deployment was inspected or changed. Historical test counts in repository documents are not new verification results. Before submission, select a fixed commit/build, rerun relevant checks, capture approved screenshots/results, verify the deployed scope separately, and complete the literature and participant-method sections using real evidence.
