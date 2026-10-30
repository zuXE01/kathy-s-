  # AI-assisted menu recommendations

Implemented locally: 2026-10-26 (Asia/Manila).

Update 2026-10-27: a separate **Chat with Kathy’s** interface now connects this recommender to Google Gemini cloud AI. See [CHATBOT.md](CHATBOT.md) for setup and conversational behavior. This document describes the deterministic recommendation engine and the original form; its ranking algorithm remains unchanged.

## What this version does

The public menu includes a **Help me choose** disclosure with a menu-group selector, optional maximum price per portion, and optional completed-order personalization. It returns up to four real menu products with factual reasons and reuses the existing portion selector and cart.

This is a deterministic, content-based recommendation engine. It is not a trained machine-learning model, generative AI, chatbot, or allergy checker. It does not call an external AI provider, need an AI API key, or send customer information to a model. Describe these distinctions accurately in project presentations.

## Customer flow

1. Open the menu and expand **Help me choose**.
2. Choose Anything, Food, Drinks, or Desserts. Optionally enter a positive PHP price limit.
3. Suggestions also use the existing **Menu section** selector below the panel. All sections gives the widest choice. Conflicting group/section choices can legitimately produce no matches.
4. Signed-in customers may check **Use my completed orders**. It is off by default and resets when account access changes.
5. Choose **Find suggestions**. Review the explanations, portions and prices.
6. Signed-in customers can add a chosen portion to the existing cart. Guests can browse recommendations and prices, then use the existing sign-in flow to order.

The price limit applies to each displayed portion, not an order total or a delivery charge. Recommendation cards exclude portions above the limit; the full catalog remains unchanged. Sign-in clears suggestions, so customers should request them again after signing in. Recommendations do not place orders or start payments.

## Ranking and data

Source of truth: the live public catalog returned through `readMenu(..., { publicOnly: true })`, not the original import snapshot or generated product descriptions.

Candidate selection:

- Exclude hidden products and invalid or missing prices.
- Require the chosen category and section when specified.
- Keep only valid portions whose rounded cent price fits the optional rounded cent budget. Products without variants use a Regular portion.
- Preserve live product IDs, portion labels and prices. Do not invent items or product claims.

With history enabled, the server reads at most the 50 most recent **completed** orders belonging to the verified user. It counts a product once per order, regardless of quantity or repeated portions. Deleted or currently hidden products do not contribute. Related sections come from the current catalog rather than historical names.

Initial score = `4 × min(completed orders containing this product, 5) + min(product appearances in its current section across those orders, 5)`.

Sort by score, then product name and ID. Select up to four results, applying a three-point penalty per already-selected item in the same section to encourage variety. Results are deterministic for the same inputs and catalog. Explicit group, section and budget constraints always filter candidates before ranking.

Without usable history, suggestions are available menu options matching the current selections, ordered deterministically with section variety. They are not labeled popular, best-selling or staff favorites. No browsing or recommendation-event tracking is added in this version.

## API

`POST /api/recommendations`, JSON body, maximum body size 2 KB:

```json
{
  "category": "coffee",
  "section": "all",
  "budget": 150,
  "useHistory": false
}
```

All fields are optional. Defaults: category/section `all`, budget `null`, useHistory `false`. Categories are `all`, `bites`, `coffee`, `sweet`. Budget must be a finite number greater than zero and at most 100000. Section must be a nonempty string of at most 120 characters. Unknown sections return no matches.

When `useHistory` is true, send `Authorization: Bearer <access token>`. The server verifies the token with `auth.getUser(token)`, rejects anonymous users, and derives the owner from that verified identity. A submitted user ID cannot choose another customer's history. Both the ownership predicate and the request-scoped client/RLS remain in effect; no privileged service key is used.

Successful response shape:

```json
{
  "recommendations": [
    {
      "item": { "id": "live-product-id", "name": "Live product name", "variants": [] },
      "reasons": ["Matches your selected menu group."]
    }
  ],
  "history": "off"
}
```

The item example above abbreviates the existing public menu fields; actual returned items include at least one eligible portion. `history` is `off`, `used`, `empty`, or `unavailable`. `used` means completed orders were loaded, not that every candidate necessarily matched those orders.

Errors: 400 invalid preferences/JSON, 401 missing or invalid history authentication, 413 oversized body, 429 existing shared API rate limit, 503 catalog/auth service unavailable. Responses set `Cache-Control: no-store`. History-query failure alone yields preference-based suggestions and `history: unavailable`, with a visible explanation. The browser uses a 15-second request timeout and a manual retry through Find suggestions; it does not poll.

## Privacy and ordering safeguards

- The history query selects only `items,status`, restricts `user_id` and `status`, and limits results to 50. No contact data, addresses, notes or payment information is requested or returned by this endpoint.
- The panel stores no preferences, history, or recommendations in browser storage. It uses temporary in-memory state; the existing cart keeps its established storage behavior.
- Account changes, sign-out, preference/section changes and page exit clear recommendations, abort active requests, and prevent late responses from restoring old results.
- No order writes, payment calls, role-transition changes, schema changes or permission-policy changes are introduced.
- Checkout remains authoritative for current availability, prices and duplicate-order recovery. Existing payment/demo disclosures remain unchanged.
- No dietary/allergen inference is made. Staff-verified ingredient and dietary metadata would be required before adding those filters.

## Files and maintenance

| File | Purpose |
| --- | --- |
| `server/recommendations.js` | Input validation, candidate selection, ranking and optional authenticated history |
| `server/app.js` | Mounts the endpoint under the existing API limiter |
| `public/js/recommendations.js` | Form requests, shared menu-card rendering, auth/lifecycle cleanup and recovery |
| `public/recommendations.css` | Mobile-first controls using existing semantic colors |
| `public/index.html` | Menu disclosure and module/style entry points |
| `test/recommendations.test.cjs` | Ranking, filters, API owner isolation and service failures |
| `test/recommendations-ui.test.cjs` | Guest/member controls, account changes, stale responses and retries |
| `test/recommendations-browser.cjs` | Manual fake-data browser QA through the existing admin preview fixture |

Run locally with the existing environment and `npm start`. No new environment variables, packages or database migrations are required. Run `npm test` for automated regressions. For browser QA, make Playwright available to Node and run `node test/recommendations-browser.cjs`. It uses installed Edge by default; `BROWSER_CHANNEL` can select another installed Playwright channel. Set `QA_SCREENSHOT_DIR` to an existing folder to save viewport captures. The fixture uses port 3102 and fake data only.

## Verification and release status

All 158 automated regression tests passed, including eight new recommendation tests. Fake-data browser checks at 320, 390 and 1280 CSS pixels passed suggestions, cart integration, empty completed history, no matches, horizontal-overflow checks, guest access, keyboard disclosure and API-error recovery. Mobile (390px) and desktop (1280px) viewport captures were visually inspected: controls stack on mobile, pair on desktop, preserve the restaurant palette, and show readable recommendation cards. The Impeccable helper engine could not run because its cache directory was unavailable; no detector scan is claimed.

Local implementation only. No Render deployment, live Supabase queries, or database changes were performed. Real-device, screen-reader and live multi-account checks remain unverified. The existing unrelated staff-order work is preserved.

## Future stages

1. Add staff-maintained, verified item attributes when the restaurant can supply them. Do not guess ingredients, allergens or dietary suitability from product names.
2. If trained AI is required, implement and evaluate content-based similarity against this deterministic baseline. Keep a meaningful held-out evaluation, then collect consent-aware impression, click, cart-add and completed-order signals; no analytics collection is included here.
3. Add optional natural-language preference extraction. Validate its structured output, then run the same catalog filters. Keep provider credentials on the server; send only the minimum required input, and never let model output place orders or establish prices.
4. Consider collaborative filtering only after sufficient real interaction data exists. Measure recommendation usefulness and latency before replacing the simpler engine.
