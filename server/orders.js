const express = require('express');
const { createHash } = require('node:crypto');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const transitions = {pending:['accepted','rejected'],accepted:['preparing','rejected'],preparing:['ready','rejected'],ready:['completed'],completed:[],rejected:[]};
function validateOrder(body) {
  if (!body || !uuid.test(body.request_id || '') || !Array.isArray(body.items) || !body.items.length || body.items.length>120 ||
    !Number.isSafeInteger(body.total_cents) || body.total_cents<0 || !['cod','demo-online'].includes(body.payment_method)) return null;
  const customer={}, seen=new Set(), items=[];
  for(const field of ['name','email','phone','address','barangay','city','province','postal','notes']) {
    const value=body.customer?.[field];
    if(typeof value!=='string' || value.trim().length>(field==='notes'?500:200) || (field!=='notes'&&!value.trim()))return null;
    customer[field]=value.trim();
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) || !/^\+?[\d ()-]{7,20}$/.test(customer.phone) ||
    customer.phone.replace(/\D/g,'').length<7 || !/^\d{4}$/.test(customer.postal))return null;
  for(const item of body.items) {
    if(!item || !uuid.test(item.product_id||'') || typeof item.label!=='string' || !item.label || item.label.length>60 ||
      !Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>99)return null;
    const key=JSON.stringify([item.product_id,item.label]); if(seen.has(key))return null; seen.add(key);
    items.push({product_id:item.product_id,label:item.label,quantity:item.quantity});
  }
  const value={customer,items,total_cents:body.total_cents,payment_method:body.payment_method};
  return {...value,request_id:body.request_id,request_hash:createHash('sha256').update(JSON.stringify(value)).digest('hex')};
}
function errorResponse(res,error) {
  if(error.code==='P0001')return res.status(409).json({error:'The menu or order status changed. Refresh and review before trying again.'});
  if(['22023','22P02','23514','23502'].includes(error.code))return res.status(400).json({error:'Check the order details and try again.'});
  if(error.code==='42501')return res.status(403).json({error:'You do not have access to this order.'});
  return res.status(503).json({error:'Order service unavailable. Retry with the same cart; do not start another order.'});
}
function ordersRouter(url,key,createClient) {
  const router=express.Router();
  router.use(async(req,res,next)=>{
    res.set('Cache-Control','no-store');
    const token=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];
    if(!token)return res.status(401).json({error:'Sign in to place an order.'});
    try {
      const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
      const {data,error}=await client.auth.getUser(token);
      if(error||!data.user||data.user.is_anonymous)return res.status(401).json({error:'Sign in again to place an order.'});
      req.orderClient=client; req.orderUser=data.user; next();
    } catch {res.status(503).json({error:'Unable to verify your account.'});}
  });
  router.use(express.json({limit:'32kb'}));
  router.get('/',async(req,res)=>{
    const page=Number(req.query.page||1);
    if(!Number.isSafeInteger(page)||page<1||page>10000)return res.status(400).json({error:'Invalid order page.'});
    try {
      const result=await req.orderClient.from('orders')
        .select('id,items,total_cents,payment_method,payment_status,status,status_note,history,created_at,updated_at',{count:'exact'})
        .eq('user_id',req.orderUser.id).order('created_at',{ascending:false}).order('id')
        .range((page-1)*10,page*10-1);
      if(result.error)return errorResponse(res,result.error);
      const items=result.data.map(({id,items,total_cents,payment_method,payment_status,status,status_note,history,created_at,updated_at})=>
        ({id,items,total_cents,payment_method,payment_status,status,status_note,history,created_at,updated_at}));
      res.json({items,total:result.count,page});
    } catch {res.status(503).json({error:'Unable to load your order history.'});}
  });
  router.get('/request/:requestId',async(req,res)=>{
    if(!uuid.test(req.params.requestId))return res.status(400).json({error:'Invalid checkout reference.'});
    try {
      const result=await req.orderClient.from('orders').select('*').eq('user_id',req.orderUser.id).eq('request_id',req.params.requestId).maybeSingle();
      if(result.error)return errorResponse(res,result.error);
      res.json({order:result.data});
    } catch {res.status(503).json({error:'Unable to check this checkout. Please retry.'});}
  });
  router.post('/',async(req,res)=>{
    const order=validateOrder(req.body);
    if(!order)return res.status(400).json({error:'Check the cart, customer details, address and payment method.'});
    const query=()=>req.orderClient.from('orders').select('*').eq('user_id',req.orderUser.id).eq('request_id',order.request_id).maybeSingle();
    try {
      let previous=await query();
      if(previous.error)return errorResponse(res,previous.error);
      if(previous.data)return previous.data.request_hash===order.request_hash?res.json({order:previous.data,reused:true}):res.status(409).json({error:'This checkout was already saved with different details. Return to the menu before starting a new order.'});
      const result=await req.orderClient.from('orders').insert({...order,user_id:req.orderUser.id}).select('*').single();
      if(result.error?.code==='23505') {
        previous=await query();
        if(previous.data?.request_hash===order.request_hash)return res.json({order:previous.data,reused:true});
        return res.status(409).json({error:'Checkout already submitted. Please reload and review.'});
      }
      if(result.error)return errorResponse(res,result.error);
      res.status(201).json({order:result.data});
    } catch {res.status(503).json({error:'Unable to confirm the save. Retry this checkout to recover the same order.'});}
  });
  router.use((error,_req,res,_next)=>res.status(error.status===413?413:400).json({error:'Invalid order request.'}));
  return router;
}
function mountAdminOrders(router) {
  router.get('/orders',async(req,res)=>{
    const page=Number(req.query.page||1),status=req.query.status||'all';
    if(!Number.isSafeInteger(page)||page<1||page>10000||!(status==='all'||Object.hasOwn(transitions,status)))return res.status(400).json({error:'Invalid order filter.'});
    try {
      let query=req.adminClient.from('orders').select('*',{count:'exact'});
      if(status!=='all')query=query.eq('status',status);
      const result=await query.order('created_at',{ascending:false}).order('id').range((page-1)*20,page*20-1);
      if(result.error)return errorResponse(res,result.error);
      res.json({items:result.data,total:result.count,page});
    } catch {res.status(503).json({error:'Unable to load orders.'});}
  });
  router.patch('/orders/:id',async(req,res)=>{
    const {status,version,note=''}=req.body||{};
    if(!uuid.test(req.params.id)||!Object.hasOwn(transitions,status)||!Number.isInteger(version)||version<1||typeof note!=='string'||note.length>500||(status==='rejected'&&!note.trim()))return res.status(400).json({error:'Select a valid status; rejection requires a reason.'});
    try {
      const result=await req.adminClient.from('orders').update({status,status_note:note.trim()}).eq('id',req.params.id).eq('version',version).select('*').maybeSingle();
      if(result.error)return errorResponse(res,result.error);
      if(!result.data)return res.status(409).json({error:'Another admin updated this order. Refresh and review its latest status.'});
      res.json({order:result.data});
    } catch {res.status(503).json({error:'Unable to update order. Refresh before retrying.'});}
  });
}
module.exports={ordersRouter,mountAdminOrders,validateOrder,transitions};
