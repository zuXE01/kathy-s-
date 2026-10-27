const { preferences } = require('./recommendations');
const categories = ['all', 'bites', 'coffee', 'sweet'];
const intents = ['recommend', 'help', 'checkout', 'history', 'dietary', 'unsupported', 'budget'];
const initialState = () => ({ category: 'all', section: 'all', budget: null, query: '', temperature: 'any', restricted: false });
function cleanState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (!['category', 'section', 'budget', 'query', 'temperature', 'restricted'].every(key => Object.hasOwn(input, key))) return null;
  const base = preferences(input);
  if (!base || typeof input.query !== 'string' || input.query.length > 80 ||
      !['any', 'hot', 'cold'].includes(input.temperature) || typeof input.restricted !== 'boolean') return null;
  return { category: base.category, section: base.section, budget: base.budget,
    query: input.query.trim(), temperature: input.temperature, restricted: input.restricted };
}
function cleanIntent(input, menu) {
  const state = cleanState(input?.state);
  if (!state || !intents.includes(input?.intent) || (state.section !== 'all' && !menu.some(item => item.section === state.section))) return null;
  return { intent: input.intent, state };
}
function guardedIntent(message, previous) {
  if (/\b(start over|reset|new chat|clear preferences)\b/i.test(message)) return { intent: 'help', state: initialState() };
  if (previous.restricted || /\b(allerg\w*|vegan|vegetarian|halal|kosher|gluten|dairy[- ]free|nut[- ]free|lactose|diabet\w*|calories|healthy|low[- ]sugar|sugar[- ]free|no nuts|no milk|no sugar|without (nuts|milk|dairy))\b/i.test(message)) {
    return { intent: 'dietary', state: { ...previous, restricted: true } };
  }
  if (/\b(checkout|check out|pay|payment|place (my |the |an )?order|cancel (my |the )?order|track (my |the )?order)\b/i.test(message)) return { intent: 'checkout', state: previous };
  if (/\b(previous orders?|order history|my usual|ordered before|past orders?)\b/i.test(message)) return { intent: 'history', state: previous };
  if (/\b(cheaper|less expensive|lower price)\b/i.test(message) && !/\d/.test(message)) return { intent: 'budget', state: previous };
  if (/\b(total budget|budget for|for \d+ (people|persons)|not sweet|less sweet|spicy|caffeine[- ]free)\b/i.test(message)) return { intent: 'unsupported', state: previous };
  const constraints = message.replace(/\b(no (price |budget )?limit|any price|remove (the )?budget)\b/gi, '');
  if (/\b(not|without|except|avoid|no)\b/i.test(constraints)) return { intent: 'unsupported', state: previous };
  return null;
}
function basicIntent(message, previous, menu) {
  const guarded = guardedIntent(message, previous);
  if (guarded) return guarded;
  const text = message.toLowerCase().replace(/non-coffee/g, 'non coffee');
  let state = { ...previous }, understood = false;
  const group = /\b(desserts?|sweets?|cake|waffles?|cookies?)\b/.test(text) ? 'sweet'
    : /\b(drinks?|coffee|tea|latte|matcha|juice)\b/.test(text) ? 'coffee'
      : /\b(food|meals?|pizza|pasta|snacks?|sandwich\w*)\b/.test(text) ? 'bites' : null;
  if (group) {
    state = { ...state, category: group, section: 'all', query: '', temperature: 'any' };
    understood = true;
  }
  if (/\b(anything|all categories|all food and drinks)\b/.test(text)) {
    state = { ...initialState(), budget: state.budget }; understood = true;
  }
  const amount = /(?:under|below|up to|at most|budget(?: of| is)?|maximum|max)\s*(?:₱|php|p)?\s*(\d+(?:\.\d{1,2})?)(?![\d.])/i.exec(message)
    || /(?:₱|php)\s*(\d+(?:\.\d{1,2})?)(?![\d.])/i.exec(message);
  if (!amount && /\b(under|below|up to|at most|budget|maximum|max)\b/i.test(message) && !/\b(no (price |budget )?limit|any price|remove (the )?budget)\b/i.test(message)) return { intent: 'budget', state: previous };
  if (amount) {
    const value = Number(amount[1]);
    if (value <= 0 || value > 100000) return { intent: 'budget', state: previous };
    state.budget = value; understood = true;
  }
  if (/\b(no (price |budget )?limit|any price|remove (the )?budget)\b/.test(text)) { state.budget = null; understood = true; }
  if (/\b(cold|iced)\b/.test(text)) { state.temperature = 'cold'; understood = true; }
  else if (/\bhot\b/.test(text)) { state.temperature = 'hot'; understood = true; }
  if (/\b(any temperature|hot or cold)\b/.test(text)) { state.temperature = 'any'; understood = true; }
  const sections = [...new Set(menu.map(item => item.section).filter(Boolean))].sort((a, b) => b.length - a.length);
  const section = sections.find(value => text.includes(value.toLowerCase()) && value.toLowerCase() !== 'desserts');
  if (section) {
    state.section = section; state.category = menu.find(item => item.section === section).category;
    understood = true;
  }
  // Match only words actually present in current menu names. Never infer ingredients.
  const ignored = new Set('i a an the and or me my please want would like recommend recommendations suggest suggestions something some for with without under below up to at most budget maximum max php pesos hot cold iced make it instead show find food foods drink drinks dessert desserts sweet sweets coffee all any order orders'.split(' '));
  const words = [...new Set(text.match(/[a-z]+/g) || [])].filter(word => word.length > 2 && !ignored.has(word));
  const matches = words.filter(word => menu.some(item => `${item.name} ${item.section}`.toLowerCase().includes(word)));
  if (matches.length) { state.query = matches.join(' ').slice(0, 80); understood = true; }
  // Negations and unverified qualities require clarification, never a false match.
  if (/\b(no|without|except|avoid|spicy|less sweet|not sweet|caffeine|decaffeinated)\b/.test(text) && !/\bno (price |budget )?limit\b/.test(text)) return { intent: 'unsupported', state: previous };
  return { intent: understood ? 'recommend' : 'help', state };
}
function filterChatMenu(menu, state) {
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
  return menu.flatMap(item => {
    if (terms.length && !terms.every(term => `${item.name} ${item.section} ${item.description || ''}`.toLowerCase().includes(term))) return [];
    if (state.temperature === 'any') return [item];
    const pattern = state.temperature === 'cold' ? /\b(cold|iced)\b/i : /\bhot\b/i;
    const options = item.variants?.length ? item.variants : [{ label: 'Regular', price: item.price }];
    const variants = options.filter(option => pattern.test(`${option.label} ${item.name}`));
    return variants.length ? [{ ...item, variants }] : [];
  });
}
const intentSchema = {
  type: 'object', additionalProperties: false, required: ['intent', 'state'],
  properties: { intent: { type: 'string', enum: intents }, state: {
    type: 'object', additionalProperties: false, required: ['category', 'section', 'budget', 'query', 'temperature', 'restricted'],
    properties: { category: { type: 'string', enum: categories }, section: { type: 'string' },
      budget: { type: ['number', 'null'] }, query: { type: 'string' }, temperature: { type: 'string', enum: ['any', 'hot', 'cold'] }, restricted: { type: 'boolean' } }
  } }
};
module.exports = { initialState, cleanState, cleanIntent, guardedIntent, basicIntent, filterChatMenu, intentSchema };
