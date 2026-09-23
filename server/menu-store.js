// Fetch deterministic batches instead of silently dropping every item after a fixed limit.
// A request-scoped client preserves its own public/admin RLS permissions.
async function readMenu(client, { publicOnly = false } = {}) {
  const batchSize = 200, items = [];
  for (let offset = 0; ; offset += batchSize) {
    let query = client.from('menu_items').select(publicOnly ? 'id,name,description,category,section,price,variants' : '*');
    if (publicOnly) query = query.eq('available',true);
    const {data,error} = await query.order('name').order('id').range(offset,offset+batchSize-1);
    if (error) throw error;
    items.push(...data);
    if (data.length < batchSize) return items;
  }
}
module.exports = { readMenu };
