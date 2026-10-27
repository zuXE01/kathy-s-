const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { readMenu } = require('./menu-store');
const { recommend } = require('./recommendations');
const { readRecommendationHistory } = require('./recommendation-history');
const { initialState, cleanState, guardedIntent, basicIntent, filterChatMenu } = require('./chat-intent');
const { cloudConfig, createCloudInterpreter } = require('./cloud-chat');

function chatRouter(url, key, createClient, env, dependencies = {}) {
  const interpret = dependencies.interpret || createCloudInterpreter(cloudConfig(env));
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/config', (_req, res) => res.json({ aiEnabled: !!interpret }));
  router.use(rateLimit({ windowMs: 60000, max: 12, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Please wait a minute before sending more messages. You can still browse the menu.' } }));
  router.use(express.json({ limit: '4kb' }));
  router.post('/', async (req, res) => {
    const { message, state: inputState, useHistory = false } = req.body || {};
    const state = inputState === undefined ? initialState() : cleanState(inputState);
    if (typeof message !== 'string' || !message.trim() || message.length > 500 || !state || typeof useHistory !== 'boolean') {
      return res.status(400).json({ error: 'Send a message of 1–500 characters and valid preferences. Start a new chat to reset.' });
    }
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    try {
      const historyData = await readRecommendationHistory({ useHistory, authorization: req.headers.authorization, url, key, createClient });
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const menu = await readMenu(client, { publicOnly: true });
      let parsed = guardedIntent(message, state), mode = 'guided';
      if (!parsed) {
        if (interpret) {
          try { parsed = await interpret(message.trim(), state, menu, controller.signal); mode = 'ai'; }
          catch {
            if (controller.signal.aborted) return;
            parsed = basicIntent(message, state, menu); mode = 'fallback';
          }
        } else { parsed = basicIntent(message, state, menu); mode = 'basic'; }
      }
      if (controller.signal.aborted) return;
      if (parsed.state.restricted) parsed.intent = 'dietary';
      let reply, recommendations = [], nextState = parsed.state;
      if (parsed.intent === 'dietary') {
        nextState = { ...state, restricted: true };
        reply = 'I cannot verify ingredients, allergens or dietary suitability from this menu. Please ask the restaurant through Contact below before choosing food. Start a new chat when you want to browse without a dietary filter.';
      } else if (parsed.intent === 'unsupported') {
        nextState = state;
        reply = 'I can match menu names, categories, labeled hot/cold portions and a price limit per portion. I cannot verify that extra requirement. Try a simpler request, or ask the restaurant through Contact below.';
      } else if (parsed.intent === 'checkout') {
        reply = 'To order, sign in, choose a portion and select Add to cart on a menu card. Open View cart, then Continue to checkout to review your order. This is demo ordering; chat does not place, pay for or cancel an order. Open Orders to track or manage a saved order.';
      } else if (parsed.intent === 'budget') {
        reply = 'What is your maximum price per portion in pesos? For example, “under ₱100”. I will keep your other preferences.';
      } else if (parsed.intent === 'help') {
        reply = 'Tell me what you would like: food, drinks or desserts, a menu item such as matcha, and an optional price limit per portion. Try “coffee under ₱150”, then “make it cold”. You can also enable completed orders for personal suggestions.';
      } else if (parsed.intent === 'history' && !useHistory) {
        reply = 'To personalize suggestions, sign in and turn on Use my completed orders below, then ask again. Your order history is optional; you can also choose Food, Drinks or Desserts.';
      } else {
        const candidates = filterChatMenu(menu, nextState).filter(item => !/add[- ]?ons?/i.test(item.section || '') || /add[- ]?ons?/i.test(nextState.query + ' ' + nextState.section));
        recommendations = recommend(candidates, { ...nextState, useHistory }, historyData.orders);
        const group = { all: 'the menu', bites: 'Food', coffee: 'Drinks', sweet: 'Desserts' }[nextState.category];
        const filters = [nextState.section === 'all' ? group : nextState.section,
          nextState.query ? 'matching “' + nextState.query + '”' : '',
          nextState.temperature !== 'any' ? 'labeled ' + nextState.temperature : '',
          nextState.budget !== null ? 'up to ₱' + nextState.budget + ' per portion' : ''].filter(Boolean).join(', ');
        reply = recommendations.length ? 'Here are options from ' + filters + '. Choose a portion to review its price.'
          : 'I found no available options from ' + filters + '. Try a higher price limit, another category, or start a new chat.';
        if (nextState.temperature !== 'any') reply += ' Only explicitly labeled temperature options are included.';
        const historyNote = { off: '', used: ' These suggestions consider your completed orders.', empty: ' You have no completed orders yet, so I used your preferences.',
          unavailable: ' Your history could not be loaded, so I used your preferences only.' }[historyData.history];
        reply += historyNote;
      }
      res.json({ reply, recommendations, state: nextState, mode, history: historyData.history });
    } catch (error) {
      if (!controller.signal.aborted) res.status(error.status === 401 ? 401 : 503).json({
        error: error.status === 401 ? error.message : 'The menu assistant is unavailable. Retry your message or browse the menu below.'
      });
    }
  });
  router.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid chat request. Keep your message under 500 characters.' }));
  return router;
}
module.exports = { chatRouter };
