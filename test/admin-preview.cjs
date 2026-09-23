// Loopback-only visual test fixture. Uses fake data, never Supabase or real credentials.
// Run manually: node test/admin-preview.cjs. Not imported by the production server.
const express = require('express');
const { createApp } = require('../server/app');
const { randomUUID } = require('node:crypto');
const rows = [{ id: randomUUID(), name: 'Signature latte', description: 'Smooth espresso and a soft swirl of milk.', category: 'coffee', price: 145, available: true }];
const fakeClient = () => ({
  auth: { getUser: async () => ({ data: { user: { email: 'demo@example.test', app_metadata: { hub_role: 'admin' } } } }) },
  from(table) {
    let filtered = table === 'profiles' ? [{id:'demo-member', name:'Demo member', created_at:'2026-09-23'}] : [...rows];
    let action, payload, single = false;
    const query = {
      select() { return this; }, order() { return this; }, range() { return this; }, limit() { return this; },
      eq(key,value) { filtered = filtered.filter(row => row[key] === value); return this; },
      insert(item) { action = 'insert'; payload = item; return this; },
      update(item) { action = 'update'; payload = item; return this; },
      delete() { action = 'delete'; return this; },
      single() { single = true; return this; }, maybeSingle() { single = true; return this; },
      then(resolve,reject) {
        if (action === 'insert') { const row = {id:randomUUID(), ...payload}; rows.push(row); filtered = [row]; }
        if (action === 'update') filtered.forEach(row => Object.assign(row,payload));
        if (action === 'delete') filtered.forEach(row => rows.splice(rows.indexOf(row),1));
        return Promise.resolve({data:single ? filtered[0] || null : filtered, count:filtered.length,error:null}).then(resolve,reject);
      }
    };
    return query;
  }
});
const app = express();
app.get('/vendor/supabase.js', (_req,res) => res.type('js').send(`window.supabase={createClient(){return {auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}}),onAuthStateChange(){},signOut:async()=>({})}}}};`));
app.use(createApp({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},fakeClient));
app.listen(3102,'127.0.0.1',() => console.log('Fake-data admin preview: http://127.0.0.1:3102/admin.html'));
