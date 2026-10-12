const orderIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const checkoutHosts=new Set(['payments-web-sandbox.paymaya.com','payments-web-sandbox.maya.ph']);

// One start request per saved order in this page. Reload/conflict recovery never
// starts payment automatically: the confirmation page checks the existing state.
export function createMayaHandoff(request,navigate,isActive) {
  const handoffs=new Map();
  return function handoff(order,{start=false}={}) {
    if(!orderIdPattern.test(order?.id||''))throw new Error('The saved order reference is invalid. Open My orders for help.');
    if(handoffs.has(order.id))return handoffs.get(order.id);
    const task=(async()=>{
      if(!isActive())return;
      let destination='/payment.html?order='+encodeURIComponent(order.id);
      if(start&&order.status==='pending'){
        try {
          const result=await request('/api/payments/maya/'+encodeURIComponent(order.id)+'/start',{
            method:'POST',...(typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(15000)}:{})
          });
          if(result?.payment?.status==='pending'&&typeof result.redirectUrl==='string'){
            const url=new URL(result.redirectUrl);
            if(url.protocol==='https:'&&checkoutHosts.has(url.hostname)&&!url.port&&!url.username&&!url.password)destination=url.href;
          }
        }catch{} // The POST may have reached Maya. Only check/recover; never retry here.
      }
      if(isActive())navigate(destination);
    })();
    handoffs.set(order.id,task);
    return task;
  };
}
