const {verifiedResult,checkoutItems}=require('./maya-client.cjs');
const conflict=message=>Object.assign(new Error(message),{status:409,code:'PAYMENT_REVIEW_REQUIRED'});
function createReliablePaymentService(db,maya) {
  async function rpc(name,args={}){const {data,error}=await db.rpc(name,args);if(error)throw new Error('Payment storage is unavailable. Check reliability database setup.');return data;}
  async function one(table,key,value){const {data,error}=await db.from(table).select('*').eq(key,value).maybeSingle();if(error)throw new Error('Payment storage is unavailable.');return data;}
  const find=orderId=>one('maya_sandbox_payments','order_id',orderId);
  const attempt=id=>one('maya_payment_attempts','id',id);
  const record=(row,values,event)=>rpc('hub_maya_record',{p_attempt:row.id,p_values:values,p_event:event});
  async function verifyAttempt(row) {
    if(row.status==='sandbox-paid'||['NOT_STARTED','CREATE_REJECTED'].includes(row.provider_status))return row;
    try {
      const result=verifiedResult(await maya.retrieve(row),row);await record(row,result,'verified');
      const aggregate=await find(row.order_id);
      if(result.status!=='sandbox-paid'&&aggregate.status==='sandbox-paid'&&['creating','pending','review'].includes(result.status)&&result.checkout_id){
        try {await maya.cancel({...row,...result});}catch{}
        await record(row,verifiedResult(await maya.retrieve({...row,...result}),{...row,...result}),'verified');
      }
      // A late success on an older attempt must stop the newer unpaid session.
      if(result.status==='sandbox-paid'){
        const snapshot=await find(row.order_id);
        if(snapshot.current_attempt_id!==row.id){
          const newer=await attempt(snapshot.current_attempt_id);
          if(newer&&['creating','pending','review'].includes(newer.status)){
            const latest=await verifyAttempt(newer);
            if(latest.status!=='sandbox-paid'&&latest.checkout_id){try{await maya.cancel(latest);}catch{}await verifyAttempt(latest);}
          }
        }
      }
    }
    catch(error){await record(row,{},'verify_failed');throw error;}
    return attempt(row.id);
  }
  async function verify(snapshot){
    const current=await attempt(snapshot.current_attempt_id||snapshot.id);
    if(!current)throw new Error('Payment attempt is unavailable.');
    await verifyAttempt(current);return find(snapshot.order_id);
  }
  async function create(order,expected=null,cancel=false){
    if(!cancel)checkoutItems(order,order.total_cents); // Reject local invalid data before claiming/contacting Maya.
    const claimed=await rpc('hub_maya_claim',{p_order:order.id,p_expected:expected,p_cancel:cancel});
    const row=claimed.attempt;
    if(claimed.created&&!cancel){
      try {const created=await maya.create(row,order);await record(row,{...created,status:'pending'},'created');}
      catch(error){
        // Only an explicit provider validation rejection proves this POST was rejected.
        // A timeout, 404 lookup, invalid response or any 5xx remains uncertain.
        const rejected=error.creationRejected===true;
        await record(row,rejected?{status:'failed',provider_status:'CREATE_REJECTED'}:{},rejected?'create_rejected':'create_unknown');
        throw new Error(rejected?'Maya rejected this test checkout. Review the order before starting another attempt.':'Checkout creation is uncertain. Use Check payment status; do not pay again.');
      }
    }
    return find(order.id);
  }
  async function retry(order,expected){
    let snapshot=await find(order.id);
    if(!snapshot||snapshot.current_attempt_id!==expected)throw conflict('Payment attempt changed. Refresh before retrying.');
    snapshot=await verify(snapshot);
    if(snapshot.status==='sandbox-paid')throw conflict('This order already has a verified payment.');
    return create(order,expected);
  }
  async function beforeClose(order,nextStatus){
    let snapshot=await find(order.id);
    if(!snapshot)snapshot=await create(order,null,true);
    if(snapshot.status!=='sandbox-paid') {
      let current=await attempt(snapshot.current_attempt_id||snapshot.id);
      if(!current)throw conflict('Payment attempt needs investigation.');
      try {
        current=await verifyAttempt(current);
        const safelyFailed=current.status==='failed'&&['PAYMENT_FAILED','AUTH_FAILED','CREATE_REJECTED'].includes(current.provider_status);
        if(!['cancelled','expired','sandbox-paid'].includes(current.status)&&!safelyFailed) {
          await record(current,{},'cancel_requested');
          try {await maya.cancel(current);}catch{}
          await verifyAttempt(current);
        }
        // A rejected creation has no provider checkout to cancel.
        if(safelyFailed)await record(current,{status:'cancelled'},'verified');
      }catch{throw Object.assign(new Error('Maya cancellation is not confirmed. The order stays open; check payment status before retrying.'),{status:503,code:'PAYMENT_CANCELLATION_UNCONFIRMED'});}
      snapshot=await find(order.id);
    }
    if(snapshot.status==='sandbox-paid'&&nextStatus==='rejected')return;
    if(!['cancelled','expired'].includes(snapshot.status))throw conflict('A paid or uncertain payment cannot be cancelled. Ask the restaurant to investigate.');
  }
  async function enqueue(reference){
    if(!await attempt(reference))return; // Do not persist arbitrary trusted-source references.
    await rpc('hub_maya_enqueue',{p_reference:reference});
  }
  async function reconcile({limit=20}={}){
    await rpc('hub_maya_schedule');let processed=0,failed=0;
    for(let i=0;i<Math.min(50,Math.max(1,limit));i++) {
      const job=await rpc('hub_maya_take_job');if(!job)break;
      let ok=false;
      try {const row=await attempt(job.reference);if(row)await verifyAttempt(row);ok=true;processed++;}catch{failed++;}
      await rpc('hub_maya_finish_job',{p_reference:job.reference,p_token:job.lease_token,p_revision:job.revision,p_ok:ok});
    }
    return {processed,failed};
  }
  async function investigate(page=1,filter='attention'){
    let query=db.from('maya_payment_investigations').select('order_id,amount_cents,status,provider_status,last_verified_at,updated_at,current_attempt_id,order_status,attempts,paid_attempts,recovery_needs_attention,needs_attention',{count:'exact'});
    if(filter==='attention')query=query.eq('needs_attention',true);
    const {data,error,count}=await query.order('updated_at',{ascending:filter==='attention'}).order('order_id').range((page-1)*20,page*20-1);
    if(error)throw new Error('Unable to load payment investigations.');
    return {items:data,total:count,page};
  }
  async function audit(orderId){const {data,error}=await db.from('maya_payment_audit').select('id,attempt_id,event,status,created_at').eq('order_id',orderId).order('id',{ascending:false}).limit(50);if(error)throw new Error('Unable to load payment history.');return data;}
  async function recheck(orderId){
    const snapshot=await find(orderId);if(!snapshot)return null;
    const {data,error}=await db.from('maya_payment_attempts').select('id').eq('order_id',orderId).limit(10);
    if(error)throw new Error('Unable to queue attempt checks.');
    for(const row of data)await enqueue(row.id);
    return verify(snapshot);
  }
  return {find,verify,start:order=>create(order),retry,beforeClose,enqueue,reconcile,investigate,audit,recheck};
}
function startPaymentWorker(service,{intervalMs=60000,onError=()=>{}}={}){
  let running=false,stopped=false;
  async function tick(){if(running||stopped)return;running=true;try{await service.reconcile();}catch{onError('payment_recovery_unavailable');}finally{running=false;}}
  const timer=setInterval(tick,intervalMs);timer.unref?.();void tick();
  return ()=>{stopped=true;clearInterval(timer);};
}
module.exports={createReliablePaymentService,startPaymentWorker};
