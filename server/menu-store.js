// Fetch deterministic batches instead of silently dropping every item after a fixed limit.
// A request-scoped client preserves its own public/admin RLS permissions.
async function readMenu(client, { publicOnly = false } = {}) {
  const batchSize = 200, maxItems = 5000, items = [];
  for (let offset = 0; offset <= maxItems; offset += batchSize) {
    let query = client.from('menu_items').select(publicOnly ? 'id,name,description,category,section,price,variants' : '*');
    if (publicOnly) query = query.eq('available',true);
    const {data,error} = await query.order('name').order('id').range(offset,offset+batchSize-1);
    if (error) throw error;
    items.push(...data);
    if(items.length>maxItems)throw new Error('Menu exceeds the supported catalog limit. Narrow the query before retrying.');
    if (data.length < batchSize) return items;
  }
  throw new Error('Menu exceeds the supported catalog limit. Narrow the query before retrying.');
}
module.exports = { readMenu };
