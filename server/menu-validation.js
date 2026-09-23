const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000 && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;
function validateItem(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { name, description, category, available } = body;
  const section = body.section ?? 'House Favorites', variants = body.variants ?? [];
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || typeof description !== 'string' || description.length > 500 ||
    !['coffee','bites','sweet'].includes(category) || typeof available !== 'boolean' || typeof section !== 'string' || !section.trim() || section.trim().length > 80 ||
    !Array.isArray(variants) || variants.length > 12) return null;
  const labels = new Set(), options = [];
  for (const option of variants) {
    if (!option || typeof option.label !== 'string' || !option.label.trim() || option.label.trim().length > 60 || !money(option.price)) return null;
    const label = option.label.trim();
    if (labels.has(label.toLowerCase())) return null;
    labels.add(label.toLowerCase()); options.push({ label, price: option.price });
  }
  // Variant prices are authoritative; never retain a stale base price after editing.
  const price = options.length ? Math.min(...options.map(option => option.price)) : body.price;
  if (!money(price)) return null;
  return { name: name.trim(), description: description.trim(), category, section: section.trim(), variants: options, price, available };
}
module.exports = { validateItem };
