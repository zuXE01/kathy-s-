const express = require('express');
const { createHash } = require('node:crypto');
const { allowedOrderStatuses } = require('./roles');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const transitions = {pending:['accepted','rejected','cancelled'],accepted:['preparing','rejected'],preparing:['ready','rejected'],ready:['completed'],completed:[],rejected:[],cancelled:[]};
// customer is deliberately not selectable via the Data API. Contact access is an
// independently authorized database function, not merely a response filter.
const orderColumns='id,user_id,request_id,request_hash,items,total_cents,delivery_cents,payment_method,payment_status,status,status_note,history,version,is_demo,created_at,updated_at';
async function attachPayments(client,orders) {
  const ids=orders.filter(order=>order.payment_method==='maya-sandbox').map(order=>order.id);
  if(!ids.length)return orders;
  let rows=[];
  try {const result=await client.from('maya_sandbox_payments').select('order_id,status').in('order_id',ids);if(result.error)throw result.error;rows=result.data;}catch{}
  return orders.map(order=>{
    if(order.payment_method!=='maya-sandbox')return order;
    const status=rows.find(row=>row.order_id===order.id)?.status||'unverified';
    return {...order,payment_status:status,payment_review_required:status==='sandbox-paid'&&['cancelled','rejected'].includes(order.status)};
  });
}
function permittedStatuses(role,order) {
  const statuses=allowedOrderStatuses(role,transitions[order.status]||[]);
  return order.payment_method==='maya-sandbox'&&order.payment_status!=='sandbox-paid'?statuses.filter(status=>['rejected','cancelled'].includes(status)):statuses;
}
async function attachContacts(client, orders, role) {
  if(role==='kitchen_staff'||!orders.length)return orders;
  // Optional enrichment must not take down the queue or turn a committed update
  // into a reported failure. Never fall back to SELECT customer or SELECT *.
  try {
    const result=await client.rpc('order_contacts',{order_ids:orders.map(order=>order.id)});
    if(result.error)throw result.error;
    const contacts=new Map(result.data.map(row=>[row.id,row.customer]));
    return orders.map(order=>({...order,customer:contacts.get(order.id),contact_status:contacts.has(order.id)?'available':'unavailable'}));
  } catch {
    return orders.map(order=>({...order,contact_status:'unavailable'}));
  }
}
function validateOrder(body) {
  if (!body || !uuid.test(body.request_id || '') || !Array.isArray(body.items) || !body.items.length || body.items.length>120 ||
    !Number.isSafeInteger(body.total_cents) || body.total_cents<0 || !['cod','demo-online','maya-sandbox'].includes(body.payment_method)) return null;
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
function errorResponse(res,error,conflictCode='ORDER_CHANGED') {
  if(error.code==='PAYMENT_REVIEW_REQUIRED'||error.code==='PAYMENT_CANCELLATION_UNCONFIRMED')return res.status(error.status).json({error:error.message,code:error.code});
  if(error.code==='P0001')return res.status(409).json({error:'The menu or order status changed. Refresh and review before trying again.',code:conflictCode});
  if(['22023','22P02','23514','23502'].includes(error.code))return res.status(400).json({error:'Check the order details and try again.'});
  if(error.code==='42501')return res.status(403).json({error:'You do not have access to this order.'});
  return res.status(503).json({error:'Order service unavailable. Retry with the same cart; do not start another order.'});
}
async function beforeClose(paymentService,order,status) {
  if(order.payment_method!=='maya-sandbox')return;
  if(!paymentService)throw Object.assign(new Error('Maya payment verification is unavailable. The order stays open. Ask the restaurant to check payment setup.'),{status:503,code:'PAYMENT_CANCELLATION_UNCONFIRMED'});
  await paymentService.beforeClose(order,status);
}
function ordersRouter(url,key,createClient,{mayaEnabled=false,paymentService=null}={}) {
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
        ({id,items,total_cents,payment_method,payment_status,status,status_note,
          history:Array.isArray(history)?history.map(({status,at,note})=>({status,at,note})):[],created_at,updated_at}));
      res.json({items:await attachPayments(req.orderClient,items),total:result.count,page});
    } catch {res.status(503).json({error:'Unable to load your order history.'});}
  });
  router.get('/request/:requestId',async(req,res)=>{
    if(!uuid.test(req.params.requestId))return res.status(400).json({error:'Invalid checkout reference.'});
    try {
      const result=await req.orderClient.from('orders').select('id,items,total_cents,payment_method,payment_status,status,status_note,history,created_at,updated_at').eq('user_id',req.orderUser.id).eq('request_id',req.params.requestId).maybeSingle();
      if(result.error)return errorResponse(res,result.error);
      if(result.data&&Array.isArray(result.data.history))result.data.history=result.data.history.map(({status,at,note})=>({status,at,note}));
      res.json({order:result.data});
    } catch {res.status(503).json({error:'Unable to check this checkout. Please retry.'});}
  });
  router.post('/:id/cancel',async(req,res)=>{
    if(!uuid.test(req.params.id))return res.status(400).json({error:'Invalid order reference.'});
    try {
      const current=await req.orderClient.from('orders').select('id,user_id,total_cents,payment_method,status,version').eq('id',req.params.id).eq('user_id',req.orderUser.id).eq('status','pending').maybeSingle();
      if(current.error)return errorResponse(res,current.error);
      if(!current.data)return res.status(409).json({error:'This order is already being prepared or has been closed.'});
      await beforeClose(paymentService,current.data,'cancelled');
      const result=await req.orderClient.from('orders').update({status:'cancelled',status_note:'Cancelled by customer'})
        .eq('id',req.params.id).eq('user_id',req.orderUser.id).eq('status','pending').eq('version',current.data.version).select('id,items,total_cents,payment_method,payment_status,status,status_note,history,created_at,updated_at').maybeSingle();
      if(result.error)return errorResponse(res,result.error);
      if(!result.data)return res.status(409).json({error:'This order is already being prepared or has been closed.'});
      res.json({order:result.data});
    } catch(error) {errorResponse(res,error);}
  });
  router.post('/',async(req,res)=>{
    const order=validateOrder(req.body);
    if(!order)return res.status(400).json({error:'Check the cart, customer details, address and payment method.'});
    if(order.payment_method==='maya-sandbox'&&(!mayaEnabled||order.total_cents<=0))return res.status(503).json({error:'Maya sandbox is unavailable or the total is zero. Choose another demo payment method.'});
    const query=()=>req.orderClient.from('orders').select(orderColumns).eq('user_id',req.orderUser.id).eq('request_id',order.request_id).maybeSingle();
    try {
      let previous=await query();
      if(previous.error)return errorResponse(res,previous.error);
      if(previous.data)return previous.data.request_hash===order.request_hash?res.json({order:previous.data,reused:true}):res.status(409).json({error:'This checkout was already saved with different details. Recover the saved order before starting another.',code:'CHECKOUT_ALREADY_SAVED'});
      const result=await req.orderClient.from('orders').insert({...order,user_id:req.orderUser.id}).select(orderColumns).single();
      if(result.error?.code==='23505') {
        previous=await query();
        if(previous.data?.request_hash===order.request_hash)return res.json({order:previous.data,reused:true});
        return res.status(409).json({error:'Checkout already submitted. Please reload and review.',code:'CHECKOUT_ALREADY_SAVED'});
      }
      if(result.error)return errorResponse(res,result.error,'MENU_CHANGED');
      res.status(201).json({order:result.data});
    } catch {res.status(503).json({error:'Unable to confirm the save. Retry this checkout to recover the same order.'});}
  });
  router.use((error,_req,res,_next)=>res.status(error.status===413?413:400).json({error:'Invalid order request.'}));
  return router;
}
function mountAdminOrders(router,paymentService=null) {
  router.get('/orders',async(req,res)=>{
    const page=Number(req.query.page||1),status=req.query.status||'all';
    if(!Number.isSafeInteger(page)||page<1||page>10000||!(['all','active','payment-review'].includes(status)||Object.hasOwn(transitions,status)))return res.status(400).json({error:'Invalid order filter.'});
    try {
      let query=req.adminClient.from(status==='payment-review'?'maya_payment_exceptions':'orders').select(orderColumns,{count:'exact'});
      if(status==='active')query=query.in('status',['pending','accepted','preparing','ready']);
      else if(!['all','payment-review'].includes(status))query=query.eq('status',status);
      const oldestFirst=['active','pending','accepted','preparing','ready'].includes(status);
      const result=await query.order('created_at',{ascending:oldestFirst}).order('id',{ascending:true}).range((page-1)*20,page*20-1);
      if(result.error)return errorResponse(res,result.error);
      const strip=req.adminRole==='kitchen_staff';
      const orders=await attachPayments(req.adminClient,await attachContacts(req.adminClient,result.data,req.adminRole));
      res.json({items:orders.map(order=>{
        const out={...order,allowed_statuses:permittedStatuses(req.adminRole,order)};
        if(strip)delete out.customer;
        return out;
      }),total:result.count,page});
    } catch {res.status(503).json({error:'Unable to load orders.'});}
  });
  router.patch('/orders/:id',async(req,res)=>{
    const {status,version,note=''}=req.body||{};
    if(!uuid.test(req.params.id)||!Object.hasOwn(transitions,status)||!Number.isInteger(version)||version<1||typeof note!=='string'||note.length>500||(status==='rejected'&&!note.trim()))return res.status(400).json({error:'Select a valid status; rejection requires a reason.'});
    if(!allowedOrderStatuses(req.adminRole,Object.keys(transitions)).includes(status))return res.status(403).json({error:'Your role cannot perform this order action.',code:'ACTION_FORBIDDEN'});
    try {
      if(['rejected','cancelled'].includes(status)) {
        const current=await req.adminClient.from('orders').select('id,user_id,total_cents,payment_method,status,version').eq('id',req.params.id).eq('version',version).maybeSingle();
        if(current.error)return errorResponse(res,current.error);
        if(!current.data||!(transitions[current.data.status]||[]).includes(status))return res.status(409).json({error:'The order changed. Refresh before retrying.'});
        await beforeClose(paymentService,current.data,status);
      }
      const result=await req.adminClient.from('orders').update({status,status_note:note.trim()}).eq('id',req.params.id).eq('version',version).select(orderColumns).maybeSingle();
      if(result.error)return errorResponse(res,result.error);
      if(!result.data)return res.status(409).json({error:'Another admin updated this order. Refresh and review its latest status.'});
      const [record]=await attachPayments(req.adminClient,await attachContacts(req.adminClient,[result.data],req.adminRole));
      const out={...record,allowed_statuses:permittedStatuses(req.adminRole,record)};
      if(req.adminRole==='kitchen_staff')delete out.customer;
      res.json({order:out});
    } catch(error) {errorResponse(res,error);}
  });
}
module.exports={ordersRouter,mountAdminOrders,validateOrder,transitions};
