// Always reconcile the saved request before repricing. Keep its ID on every
// failure: creating a new ID after an uncertain save could duplicate an order.
export async function recoverCheckoutConflict(error, requestId, request) {
  const result=await request('/api/orders/request/'+encodeURIComponent(requestId));
  if(result.order)return {kind:'saved',order:result.order};
  if(error.code==='CHECKOUT_ALREADY_SAVED')throw new Error('Your checkout was already submitted but could not be recovered. Reload to retry; do not start a new order.');
  return {kind:'menu'};
}
