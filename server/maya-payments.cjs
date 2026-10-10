const express=require('express');
const {randomUUID}=require('node:crypto');
const {createMayaClient,verifiedResult}=require('./maya-client.cjs');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const publicPayment=row=>({status:row?.status||'not-started',providerStatus:row?.provider_status||null,updatedAt:row?.updated_at||null});
function createPaymentService(db,maya) {
  async function find(orderId){const {data,error}=await db.from('maya_sandbox_payments').select('*').eq('order_id',orderId).maybeSingle();if(error)throw new Error('Sandbox payment storage is unavailable. Ask the owner to finish setup.');return data;}
  async function save(row,values){
    // A late/duplicate failure must never erase a verified success.
    const {error}=await db.from('maya_sandbox_payments').update({...values,updated_at:new Date().toISOString()}).eq('id',row.id).neq('status','sandbox-paid');
    if(error)throw new Error('Payment result could not be saved. Check status again.');
    return find(row.order_id);
  }
  async function verify(row){if(row.status==='sandbox-paid')return row;return save(row,verifiedResult(await maya.retrieve(row),row));}
  return {find,verify,
    async start(order){
      let row=await find(order.id);
      if(row)return row;
      const attempt={id:randomUUID(),order_id:order.id,user_id:order.user_id,amount_cents:order.total_cents,status:'creating'};
      const {data,error}=await db.from('maya_sandbox_payments').insert(attempt).select('*').single();
      if(error?.code==='23505')return find(order.id);
      if(error)throw new Error('Unable to prepare the test payment. Ask the owner to check sandbox setup.');
      row=data;
      try {const created=await maya.create(row);return await save(row,{...created,status:'pending'});}
      catch { // The request may have reached Maya. Never blindly create a second session.
        throw new Error('The payment session could not be confirmed. Open Check payment status to recover it. Do not start another payment.');
      }
    }
  };
}
function mayaRouter({config,url,key,secret,createClient,maya}) {
  const router=express.Router();
  router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/config',(_req,res)=>res.json({enabled:!!config,publicDemo:!!config?.demo}));
  if(!config){router.use((_req,res)=>res.status(503).json({error:'Maya sandbox is not configured yet.'}));return router;}
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const service=createPaymentService(db,maya||createMayaClient(config));
  router.post('/webhook',express.json({limit:'16kb'}),async(req,res)=>{
    // Use Express's verified proxy topology, never parse arbitrary forwarded headers here.
    const ip=req.ip?.replace(/^::ffff:/,'');
    if(!['13.229.160.234','3.1.199.75'].includes(ip))return res.status(403).json({error:'Webhook source denied.'});
    const reference=req.body?.requestReferenceNumber;
    if(!uuid.test(reference||''))return res.status(400).json({error:'Invalid payment reference.'});
    try {
      const {data,error}=await db.from('maya_sandbox_payments').select('*').eq('id',reference).maybeSingle();
      if(error)throw error;
      if(data)await service.verify(data); // Webhook body is a hint; retrieve authoritative data.
      res.json({received:true});
    }catch {res.status(503).json({error:'Unable to verify payment yet.'});}
  });
  router.use(async(req,res,next)=>{
    const token=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];
    if(!token)return res.status(401).json({error:'Sign in to view or pay for your order.'});
    try {
      const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
      const {data,error}=await client.auth.getUser(token);
      if(error||!data.user||data.user.is_anonymous)return res.status(401).json({error:'Sign in again to continue.'});
      req.paymentUser=data.user;req.paymentClient=client;next();
    }catch {res.status(503).json({error:'Unable to check your account. Try again.'});}
  });
  async function ownedOrder(req,res){
    if(!uuid.test(req.params.id)) {res.status(400).json({error:'Invalid order reference.'});return;}
    const {data,error}=await req.paymentClient.from('orders').select('id,user_id,total_cents,payment_method,status').eq('id',req.params.id).eq('user_id',req.paymentUser.id).maybeSingle();
    if(error)throw new Error('Unable to read this order. Try again.');
    if(!data||data.payment_method!=='maya-sandbox'){res.status(404).json({error:'Maya sandbox order not found.'});return;}
    return data;
  }
  router.post('/:id/start',async(req,res)=>{
    try {
      const order=await ownedOrder(req,res);if(!order)return;
      if(order.status!=='pending')return res.status(409).json({error:'This order can no longer start a payment. Check its status.'});
      const row=await service.start(order);
      res.json({payment:publicPayment(row),redirectUrl:row?.status==='pending'?row.redirect_url:null});
    }catch(error){res.status(503).json({error:error.message});}
  });
  router.post('/:id/check',async(req,res)=>{
    try {
      const order=await ownedOrder(req,res);if(!order)return;
      let row=await service.find(order.id);
      if(row)row=await service.verify(row);
      res.json({payment:publicPayment(row),orderStatus:order.status,redirectUrl:row?.status==='pending'&&order.status==='pending'?row.redirect_url:null});
    }catch(error){res.status(503).json({error:error.message});}
  });
  router.use((error,_req,res,_next)=>res.status(400).json({error:'Invalid payment request.'}));
  return router;
}
module.exports={mayaRouter,createPaymentService};
