// Local-only synthetic UI fixture. Does not load .env or access Maya/Supabase.
const express=require('express'),path=require('node:path'),app=express();
const session={access_token:'synthetic',user:{id:'demo',app_metadata:{hub_role:'owner'}}};
app.get('/api/config',(_req,res)=>res.json({url:'https://example.supabase.co',publishableKey:'demo'}));
app.get('/vendor/supabase.js',(_req,res)=>res.type('js').send(`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:${JSON.stringify(session)}}}),onAuthStateChange:fn=>setTimeout(()=>fn('SIGNED_IN',${JSON.stringify(session)}),0),signOut:async()=>({})}})};`));
app.get('/api/admin/overview',(_req,res)=>res.json({email:'synthetic@example.test',role:'owner',members:2,menu:120,available:120}));
app.get('/api/admin/payments',(_req,res)=>res.json({page:1,total:2,items:[
 {order_id:'10000000-0000-4000-8000-000000000001',status:'review',order_status:'pending',amount_cents:45000,last_verified_at:null,attempts:1,paid_attempts:0,recovery_needs_attention:true},
 {order_id:'10000000-0000-4000-8000-000000000002',status:'sandbox-paid',order_status:'rejected',amount_cents:26800,last_verified_at:new Date().toISOString(),attempts:2,paid_attempts:1}
]}));
app.get('/api/admin/payments/:id/history',(_req,res)=>res.json({items:[]}));
app.post('/api/admin/payments/:id/recheck',(_req,res)=>res.json({ok:true}));
app.use(express.static(path.resolve(__dirname,'../../public')));
app.listen(3097,'127.0.0.1',()=>console.log('Synthetic UI preview only: http://127.0.0.1:3097/admin.html'));
