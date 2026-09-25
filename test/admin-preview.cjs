// Loopback-only visual test fixture. Uses fake data, never Supabase or real credentials.
// Run manually: node test/admin-preview.cjs. Not imported by the production server.
const express = require('express');
const { createApp } = require('../server/app');
const { randomUUID } = require('node:crypto');
const rows = require('../server/menu-catalog.cjs').items.map(item => ({...item,id:randomUUID()}));
const {createOrderFixture,memberId}=require('./order-fixture.cjs');
const orderFixture=createOrderFixture(rows);
const fakeClient = () => ({
  auth: { getUser: async () => ({ data: { user: { id:memberId, email: 'demo@example.test', user_metadata:{name:'Demo member'}, app_metadata: { hub_role: 'admin' } } } }) },
  from(table) {
    if(table==='orders')return orderFixture.client(null,null,{global:{headers:{Authorization:'Bearer admin'}}}).from(table);
    let filtered = table === 'profiles' ? [{id:'demo-member', name:'Demo member', created_at:'2026-09-23'}] : [...rows];
    let action, payload, single = false;
    const query = {
      select() { return this; }, order() { return this; }, range(start,end) { filtered=filtered.slice(start,end+1); return this; }, limit() { return this; },
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
app.get('/vendor/supabase.js', (_req,res) => res.type('js').send(`
const fixtureUser={id:'${memberId}',email:'demo@example.test',user_metadata:{name:'Demo member'},app_metadata:{hub_role:'admin'}};
window.supabase={createClient(){let changed;return {auth:{
getSession:async()=>({data:{session:{access_token:'fixture',user:fixtureUser}}}),
getUser:async()=>({data:{user:fixtureUser}}),
onAuthStateChange(callback){changed=callback;setTimeout(()=>callback('INITIAL_SESSION',{user:fixtureUser}),0);},
signOut:async()=>{if(changed)changed('SIGNED_OUT',null);return {};}
}}}};`));
app.use(createApp({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},fakeClient));
app.listen(3102,'127.0.0.1',() => console.log('Fake-data admin preview: http://127.0.0.1:3102/admin.html'));
