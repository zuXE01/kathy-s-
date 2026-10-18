// Presentation helpers: published brochure references, never calculated quotations.
export function offerPriceLabel(offer,format){
  const lowest=offer.rates.reduce((best,rate)=>rate.price<best.price?rate:best);
  if(offer.perGuest)return 'From '+format(lowest.price)+' per guest at '+lowest.guests+' guests';
  if(offer.family==='venue')return format(lowest.price)+' · '+lowest.label+(offer.rates.length>1?' (lowest listed rate)':'');
  return 'From '+format(lowest.price)+' for '+lowest.guests+' guests';
}
export function offerHighlights(offer){
  const shared=['4-hour venue rental','2 hours for setup and 1 hour for pack-up','Tables, chairs, centerpieces and two-color motif','Buffet with rice, dessert and a drink','Unlimited hot brewed coffee'];
  const unique=[...new Set(offer.inclusions)];
  return (offer.family==='general'||offer.family==='debut'?unique.filter(text=>!shared.includes(text)):unique).slice(0,3);
}
export function selectionContext(offer,guests){
  const count=Number(guests),maximum=offer?.capacity||100;
  const rate=offer?.rates.find(rate=>rate.guests===count);
  return {maximum,rate,overCapacity:Number.isFinite(count)&&count>maximum};
}
