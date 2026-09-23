// Use current catalog prices, never the saved cart's price or product name.
export function resolveCheckout(saved, catalog) {
  const lines = [], seen = new Set();
  for (const entry of saved) {
    let identity;
    try { identity = JSON.parse(entry.id); } catch { throw new Error('Your cart is invalid. Please rebuild it from the menu.'); }
    if (!Array.isArray(identity) || identity.length !== 2 || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 99 || seen.has(entry.id)) throw new Error('Your cart is invalid. Please rebuild it from the menu.');
    seen.add(entry.id);
    const item = catalog.find(item => item.id === identity[0] && item.available !== false);
    const options = item && (item.variants?.length ? item.variants : [{label:'Regular',price:item.price}]);
    const option = options?.find(option => option.label === identity[1]);
    if (!option || !Number.isFinite(Number(option.price)) || Number(option.price)<0) throw new Error('An item or size is no longer available. Please update your cart.');
    lines.push({id:entry.id,name:item.name,label:option.label,quantity:entry.quantity,cents:Math.round(Number(option.price)*100)});
  }
  return {lines,total:lines.reduce((sum,line)=>sum+line.quantity*line.cents,0)};
}
export function customerDetails(form) {
  const fields = ['name','email','phone','address','barangay','city','province','postal','notes','payment'];
  const customer = Object.fromEntries(fields.map(key=>[key,String(form.get(key)||'').trim()]));
  for (const key of ['name','email','phone','address','barangay','city','province','postal']) {
    if (!customer[key] || customer[key].length > 200) throw new Error('Please complete all required customer and address fields.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new Error('Enter a valid email address.');
  if (!/^\+?[\d ()-]{7,20}$/.test(customer.phone) || customer.phone.replace(/\D/g,'').length<7) throw new Error('Enter a valid phone number.');
  if (!/^\d{4}$/.test(customer.postal)) throw new Error('Enter a four-digit Philippine postal code.');
  if (!['cod','demo-online'].includes(customer.payment) || customer.notes.length>500) throw new Error('Check the payment method and order notes.');
  return customer;
}
