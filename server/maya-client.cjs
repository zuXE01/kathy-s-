const API='https://pg-sandbox.paymaya.com';
const CHECKOUT_HOSTS=new Set(['payments-web-sandbox.paymaya.com','payments-web-sandbox.maya.ph']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Published shared test credentials, never production keys. Explicit opt-in only.
const PUBLIC_DEMO={publicKey:'pk-Z0OSzLvIcOI2UIvDhdTGVVfRSSeiGStnceqwUE7n0Ah',secretKey:'sk-X8qolYjy62kIzEbr0QRK1h4b4KDVHaNcwMYk39jInSl'};
function mayaConfig(env) {
  if(env.MAYA_SANDBOX_ENABLED!=='true')return null;
  const demo=env.MAYA_SANDBOX_PUBLIC_DEMO==='true';
  const publicKey=demo?PUBLIC_DEMO.publicKey:env.MAYA_SANDBOX_PUBLIC_KEY;
  const secretKey=demo?PUBLIC_DEMO.secretKey:env.MAYA_SANDBOX_SECRET_KEY;
  if(!publicKey?.startsWith('pk-')||!secretKey?.startsWith('sk-')||!env.SUPABASE_SECRET_KEY)
    throw new Error('Maya sandbox requires sandbox API keys and SUPABASE_SECRET_KEY. See MAYA_SANDBOX.md.');
  const origin=new URL(env.APP_BASE_URL||'http://localhost:3000');
  if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||
    !(origin.protocol==='https:'||(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname))))
    throw new Error('APP_BASE_URL must be an HTTPS origin, or localhost for development.');
  return {publicKey,secretKey,origin:origin.origin,demo};
}
function sandboxRedirect(value) {
  const url=new URL(value);
  if(url.protocol!=='https:'||!CHECKOUT_HOSTS.has(url.hostname)||url.port||url.username||url.password)throw new Error('Unexpected Maya checkout destination.');
  return url.href;
}
function createMayaClient(config,fetcher=fetch) {
  async function call(path,key,body,method=body?'POST':'GET') {
    const response=await fetcher(API+path,{method,redirect:'error',
      headers:{Authorization:'Basic '+Buffer.from(key+':').toString('base64'),'Content-Type':'application/json'},
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(4000)});
    if(!response.ok)throw Object.assign(new Error('Maya sandbox is unavailable. Check payment status before retrying.'),{providerStatus:response.status});
    return response.json();
  }
  return {
    async create(payment) {
      const returnUrl=config.origin+'/payment.html?order='+encodeURIComponent(payment.order_id);
      const result=await call('/checkout/v1/checkouts',config.publicKey,{
        totalAmount:{value:(payment.amount_cents/100).toFixed(2),currency:'PHP'},
        // Never send saved contact details or addresses to a shared sandbox merchant.
        buyer:{firstName:'Sandbox',lastName:'Customer',contact:{email:'sandbox@example.com'}},
        requestReferenceNumber:payment.id,
        redirectUrl:{success:returnUrl+'&result=success',failure:returnUrl+'&result=failure',cancel:returnUrl+'&result=cancel'}
      });
      if(!uuid.test(result.checkoutId||''))throw new Error('Maya returned an invalid checkout reference.');
      return {checkout_id:result.checkoutId,redirect_url:sandboxRedirect(result.redirectUrl)};
    },
    retrieve:payment=>call(payment.checkout_id?'/payments/v1/payments/'+encodeURIComponent(payment.checkout_id):'/payments/v1/payment-rrns/'+encodeURIComponent(payment.id),config.secretKey),
    cancel:payment=>{
      if(!uuid.test(payment.checkout_id||''))throw new Error('Payment identity must be verified before cancellation.');
      return call('/payments/v1/payments/'+encodeURIComponent(payment.checkout_id)+'/cancel',config.secretKey,undefined,'POST');
    }
  };
}
function verifiedResult(result,payment) {
  const matches=Array.isArray(result)?result.filter(row=>row?.requestReferenceNumber===payment.id):[result];
  if(matches.length!==1)throw new Error('Payment result is uncertain. Check again later; do not submit another payment.');
  const value=matches[0]||{};
  const rawAmount=String(value.amount??value.totalAmount?.value??'');
  const amount=Number(rawAmount);
  const currency=value.currency??value.totalAmount?.currency;
  if(value.requestReferenceNumber!==payment.id||!/^\d+(\.\d{1,2})?$/.test(rawAmount)||!Number.isSafeInteger(Math.round(amount*100))||Math.round(amount*100)!==Number(payment.amount_cents)||
    currency!=='PHP'||!uuid.test(value.id||'')||(payment.checkout_id&&value.id!==payment.checkout_id))throw new Error('Payment verification mismatch. Ask the restaurant to review this sandbox order.');
  const statuses={PAYMENT_SUCCESS:'sandbox-paid',PAYMENT_FAILED:'failed',AUTH_FAILED:'failed',PAYMENT_CANCELLED:'cancelled',PAYMENT_EXPIRED:'expired',PENDING_TOKEN:'pending',PENDING_PAYMENT:'pending',FOR_AUTHENTICATION:'pending',AUTHENTICATING:'pending',AUTH_SUCCESS:'pending',PAYMENT_PROCESSING:'pending'};
  const providerStatus=value.status??value.paymentStatus;
  const status=providerStatus==='PAYMENT_SUCCESS'&&value.isPaid!==true?'review':statuses[providerStatus]||'review';
  return {checkout_id:value.id,status,provider_status:String(providerStatus||'UNKNOWN').slice(0,80)};
}
module.exports={mayaConfig,createMayaClient,sandboxRedirect,verifiedResult};
