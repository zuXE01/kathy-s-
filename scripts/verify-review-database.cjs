// Optional isolated PostgreSQL smoke test. Never connects to Supabase.
// Usage: node scripts/verify-review-database.cjs <absolute path to @electric-sql/pglite>
const fs=require('node:fs'),path=require('node:path');
async function main() {
  if(!process.argv[2])throw new Error('Supply the path to a separately installed @electric-sql/pglite package.');
  const {PGlite}=require(path.resolve(process.argv[2]));
  const db=new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on all functions in schema auth to anon,authenticated;
      insert into auth.users(id) values ('00000000-0000-4000-8000-000000000010'),('00000000-0000-4000-8000-000000000011');
    `);
    for(let run=0;run<2;run++) {
      for(const file of ['schema.sql','admin-setup.sql','menu-catalog-setup.sql','customer-details-setup.sql','orders-setup.sql']) {
        await db.exec(fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8'));
      }
      if(run===0)await db.exec("update public.profiles set name='Preserve this edited name';");
    }
    const preserved=await db.query("select count(*)::int as count from public.profiles where name='Preserve this edited name'");
    if(preserved.rows[0].count!==2)throw new Error('Repeated setup overwrote edited profiles');
    await db.exec(`insert into public.menu_items(name,category,price,section,variants) values ('Test coffee','coffee',100,'Coffee','[{"label":"Hot","price":100}]');`);
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/orders-verification.sql'),'utf8'));
    console.log('PASS: repeated setup, profile preservation, repricing, order transitions, row isolation, contact-column denial, authorized contact lookup, kitchen denial, anonymous denial.');
  } finally {await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
