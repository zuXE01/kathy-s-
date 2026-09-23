// Prints repeatable SQL for SQL Editor / the connected database tool. No credentials.
const { items } = require('../server/menu-catalog.cjs');
function importSql() {
  const json = JSON.stringify(items).replace(/'/g, "''");
  return `insert into public.menu_items (source_key,name,category,section,description,price,variants,available)
select source_key,name,category,section,description,price,variants,available
from jsonb_to_recordset('${json}'::jsonb) as x(source_key text,name text,category text,section text,description text,price numeric,variants jsonb,available boolean)
on conflict do nothing;`;
}
if (require.main === module) process.stdout.write(importSql());
module.exports = { importSql };
