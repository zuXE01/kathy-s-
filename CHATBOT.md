# Kathy’s menu chatbot

Added 2026-10-27 (Asia/Manila). Open the public menu and expand **Chat with Kathy’s**.

## Purpose

Implements the requested AI-Assisted Restaurant Ordering and Customer Recommendation System: customers describe preferences in chat, ask follow-up questions, choose a category, or opt into suggestions based on their completed orders. The existing **Help me choose** form remains available.

The chatbot combines an Ollama language model for preference extraction with the existing deterministic recommendation engine. The model interprets a request; application code selects available products, checks portion prices and writes factual replies. It does not generate a fictional menu, independently confirm ingredient claims, or place orders.

Example conversation:

1. “Coffee under PHP 150” → coffee options within that price per portion.
2. “Make it cold” → retain the price limit and show explicitly labeled cold portions.
3. “Desserts instead” → switch category, clear the coffee/temperature restriction and keep the price limit.
4. Enable **Use my completed orders**, then ask “My usual” → boost previously ordered products and related sections, restricted to that account’s completed orders.

Customers choose a portion and use **Add to cart** on the returned cards, then use the existing cart and checkout. Guests can chat and see prices but must sign in to add items. Chat itself never creates, updates, cancels or pays for an order. Demo payment/delivery messaging remains in place.

## Local Ollama setup

Ollama runs on the same host as the Express server by default. Customers do not need to install it on their devices.

1. Install [Ollama for Windows](https://docs.ollama.com/windows) or the appropriate runtime for your server.
2. Start Ollama and download a model. The initial configuration uses the small [Gemma 3 1B model](https://ollama.com/library/gemma3:1b):

   ```powershell
   ollama pull gemma3:1b
   ```

3. Add these server-only entries to your existing `.env`:

   ```dotenv
   CHAT_AI_ENABLED=true
   OLLAMA_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=gemma3:1b
   ```

4. Restart Kathy’s server with `npm start`.
5. Run `npm run test:chat-ai` to check real model interpretation using synthetic requests and the source catalog.

If the Ollama desktop application is not running, `ollama serve` starts its server. Do not start a second copy if the port is already in use. The package example defaults to `CHAT_AI_ENABLED=false` so existing deployments start without a model.

No hosted-AI key or new npm dependency is required. A small model can misunderstand complex wording. Review the displayed **Current choices**, refine the request or start a new chat. Hardware and model load time affect latency; larger models need separate latency and extraction-quality testing.

For a hosted Kathy’s website, `127.0.0.1` refers to its server, not the owner’s laptop. Provision Ollama on a private reachable host and set `OLLAMA_URL` accordingly; installing it on this development computer does not activate AI on Render. Keep the model API private. No deployment, tunnel, public Ollama exposure or cloud infrastructure is created by this feature.

## Honest modes and fallback

- **AI:** Ollama returned valid structured preferences; the server used the live menu to answer.
- **Basic:** AI is disabled. A limited English parser handles category names, catalog words, price limits and hot/cold follow-ups.
- **Fallback:** AI is configured but offline, busy, slow or returned invalid output. Basic matching answers when it can, with a visible notice.
- **Guided:** Built-in ordering, history-consent, dietary or clarification guidance; this reply did not require model inference.

The browser labels these modes. A basic reply is never presented as a model-generated answer. Invalid model sections, negative prices, malformed JSON and unknown intent/state values are rejected. The AI has no executable tools and its prose is not displayed.

## Architecture

`public/js/menu-chat.js` sends the current message, validated preference context and explicit history choice to `POST /api/chat`. `server/chat.js` verifies any requested history access, reads the public catalog, interprets the message, filters matching candidates and calls the existing recommender. `createMenuCard` displays the latest suggestions and reuses `addToCart`.

`server/ollama-chat.js` calls Ollama’s [chat endpoint](https://docs.ollama.com/api/chat) with non-streaming [structured JSON output](https://docs.ollama.com/capabilities/structured-outputs). The prompt includes only the current message, previous preference fields, schema and public catalog section names. Completed orders, customer identities, contact fields, authentication tokens and payment information are never included in the model request.

`server/recommendation-history.js` is shared with the existing recommendation endpoint. It verifies the bearer token, queries `items,status` for the verified owner’s latest 50 completed orders, and retains request-scoped RLS. Browser-supplied owner IDs have no effect.

The same ranking weights and section-diversity rules apply as documented in [AI_ASSISTED_RECOMMENDATIONS.md](AI_ASSISTED_RECOMMENDATIONS.md). Chat also filters requested name/search terms and explicitly labeled temperatures. Generic suggestions exclude add-on sections unless explicitly requested. A portion that exceeds the price limit cannot appear on a suggestion card.

## Request and response

`GET /api/chat/config` returns only `{"aiEnabled":true|false}`. It reports configuration, not model health, and exposes no model endpoint, credentials or identity.

`POST /api/chat` accepts up to 4 KB of JSON:

```json
{
  "message": "make it cold",
  "state": {
    "category": "coffee",
    "section": "Coffee",
    "budget": 150,
    "query": "",
    "temperature": "any",
    "restricted": false
  },
  "useHistory": false
}
```

`message` must be 1–500 characters. Omit `state` on the first turn; subsequent requests use the state returned by the previous response. Only known state fields are retained. History defaults off and requires a valid bearer token when enabled.

The response contains `reply`, `recommendations` (the existing item/reasons shape), `state`, `mode` and `history`. Rendering uses text nodes, not model-provided HTML. A failed request leaves the draft available for retry. Follow-up state only advances after success.

Responses use `Cache-Control: no-store`. Chat has a 12-request/minute/IP limit in addition to the existing shared API limit. The model adapter allows two simultaneous requests per app process and times out after 12 seconds. The browser stops a request after 20 seconds and offers a manual retry. Model saturation falls back to basic matching; a missing live catalog yields a recoverable 503 rather than invented products. These limits are per process, not a distributed quota.

## Privacy and boundaries

- Conversation text and preferences are held in tab memory only; no chat table, persistent browser storage or transcript analytics are added. Only the latest 12 displayed messages remain in the transcript.
- The model receives the current typed message, so the interface asks customers to avoid personal and payment details. Restaurant order-history data is used only by the server-side ranker.
- New chat, account changes, sign-out and page exit clear conversation state and suggestions. History consent resets on account changes; New chat retains the customer’s current checkbox choice.
- Cancelled requests and old-account responses cannot repopulate the UI. Back/forward-cache restoration reloads the page to reestablish authentication listeners.
- History access failures from the database are disclosed and fall back to preferences. Authentication failures require signing in again or continuing without history.
- Allergy/dietary/nutrition requests get restaurant-contact guidance instead of suitability claims. That restriction carries across follow-ups until explicit reset. The catalog does not contain verified dietary metadata.
- There are no automatic cart additions, order writes, status transitions or payment actions. The normal checkout still verifies current prices and availability and preserves duplicate-order recovery.

## Testing and release

Run `npm test` for deterministic regression tests. New suites cover interpretation, follow-up state, temperature/portion filtering, private history ownership, malformed model output, AI fallback, stale responses, duplicate sends, retry and page/account cleanup.

With Playwright available, run `node test/chat-browser.cjs`. It uses installed Edge by default and fake catalog/account data at port 3102. Each viewport gets a fresh fixture so production rate limits remain intact. Set `NODE_PATH` to your Playwright installation when needed; optional `BROWSER_CHANNEL` and `QA_SCREENSHOT_DIR` select another installed browser and an existing capture directory. Browser checks cover 320px, 390px and 1280px, keyboard disclosure, follow-ups, cart additions, consent, guest controls and retry.

`npm run test:chat-ai` is an explicit live-model smoke test and is not part of the default suite. It uses no real customer data. Local validation and deployment evidence are recorded separately below; a mock-provider test is not a live AI verification.

No new database tables, migrations or permission policies are required. Deployment and real-phone/screen-reader checks are separate from local implementation.

### Local verification record — 2026-10-27

- All 170 automated tests passed, including 12 new chatbot tests and the existing recommendation, authentication, checkout, staff-order and payment tests.
- Browser scenarios passed at 320px, 390px and 1280px using synthetic data; 390px and 1280px captures were visually inspected. The cream/navy/burgundy identity, readable messages and responsive controls are preserved.
- The installed-browser checks exercise basic mode, not a real model. Provider request/schema validation and failure fallback are separately tested with a mock Ollama response.
- No Render deployment or live database mutation/query was performed. Real-device and screen-reader checks remain unverified. The Impeccable helper was unavailable in this session; no detector certification is claimed.
