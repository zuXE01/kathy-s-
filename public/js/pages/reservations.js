import { reservationOffers, alaCarte, manilaToday, prepareReservationInquiry } from '../reservation-offers.js';
const el=id=>document.getElementById(id);
const node=(tag,text,className)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;};
const money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(value);
const familyNames={general:'Birthdays, baptisms & general occasions',debut:'Debut',wedding:'Wedding',venue:'Venue rental only'};
function renderOffers(){
  const matches=reservationOffers.filter(offer=>el('offerFamily').value==='all'||offer.family===el('offerFamily').value);
  el('offerList').replaceChildren();
  for(const offer of matches){
    const article=node('article',undefined,'offer');article.append(node('h3',offer.name),node('p',familyNames[offer.family],'offer-type'));
    article.append(node('p',offer.perGuest?'From '+money(Math.min(...offer.rates.map(rate=>rate.price)))+' per guest':'From '+money(Math.min(...offer.rates.map(rate=>rate.price))),'offer-price'));
    if(offer.capacity)article.append(node('p','Listed capacity: up to '+offer.capacity+' guests.'));
    const rates=node('dl',undefined,'rate-list');for(const rate of offer.rates){const row=node('div');row.append(node('dt',rate.label||rate.guests+' guests'),node('dd',money(rate.price)+(offer.perGuest?' / guest':'')));rates.append(row);}article.append(rates);
    if(offer.rates.some(rate=>'additionalGuest' in rate)){
      const details=node('details');details.append(node('summary','Additional guest rates'));
      const list=node('ul');offer.rates.forEach(rate=>list.append(node('li',rate.guests+'-guest tier: '+(rate.additionalGuest?money(rate.additionalGuest)+' per additional guest':'confirm the rate with the restaurant (brochure text unclear)'))));
      details.append(list,node('p','Additional guests require capacity and pricing confirmation. These rates are not an automatic quotation.','fine'));article.append(details);
    }
    const list=node('ul');[...new Set(offer.inclusions)].forEach(text=>list.append(node('li',text)));article.append(list);
    if(offer.notes)article.append(node('p',offer.notes,'fine'));
    if(offer.food){const details=node('details');details.append(node('summary','Food choices'));for(const [group,choices] of Object.entries(offer.food)){const block=node('div',undefined,'food-group');block.append(node('h4',group),node('p',choices.join(' · ')));details.append(block);}details.append(node('p','Confirm the number of dishes and any substitutions in your quotation.','fine'));article.append(details);}
    if(offer.extras){const details=node('details');details.append(node('summary','Package add-ons and extra charges'));const list=node('ul');offer.extras.forEach(text=>list.append(node('li',text)));details.append(list,node('p','Some services may already be included. Ask before adding them; do not add these rates to à-la-carte rates.','fine'));article.append(details);}
    const source=node('a','Open original brochure (new tab)','source-link');source.href='/assets/reservations/'+offer.source;source.target='_blank';source.rel='noopener';article.append(source);
    const choose=node('button','Inquire about '+offer.name,'primary');choose.type='button';choose.addEventListener('click',()=>{el('reservationOffer').value=offer.id;el('inquiryDraft').hidden=true;el('inquiry').scrollIntoView({block:'start'});el('reservationOffer').focus();});article.append(choose);el('offerList').append(article);
  }
  el('offerStatus').textContent=matches.length+' offer'+(matches.length===1?'':'s')+' shown. Select an offer to prepare an inquiry.';
}
for(const offer of reservationOffers){const option=node('option',offer.name);option.value=offer.id;el('reservationOffer').append(option);}
for(const [service,price] of alaCarte)el('extraList').append(node('dt',service),node('dd',price));
el('reservationDate').min=manilaToday();el('offerFamily').addEventListener('change',renderOffers);renderOffers();
el('reservationForm').addEventListener('input',()=>{el('inquiryDraft').hidden=true;el('inquiryError').textContent='';});
el('reservationForm').addEventListener('submit',event=>{
  event.preventDefault();el('inquiryError').textContent='';
  try{
    const values=Object.fromEntries(new FormData(event.currentTarget));
    const draft=prepareReservationInquiry(values);el('inquiryText').value=draft.text;el('inquiryEmail').href=draft.href;
    el('draftStatus').textContent='';el('inquiryDraft').hidden=false;el('draft-title').focus();
  }catch(error){el('inquiryDraft').hidden=true;el('inquiryError').textContent=error.message;el('inquiryError').focus();}
});
el('copyInquiry').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(el('inquiryText').value);el('draftStatus').textContent='Message copied. Paste it into an email to kathyshub08@gmail.com and send it yourself.';}
  catch{el('inquiryText').focus();el('inquiryText').select();el('draftStatus').textContent='Automatic copying is unavailable. Copy the selected message and email kathyshub08@gmail.com.';}
});
el('editInquiry').addEventListener('click',()=>{el('inquiryDraft').hidden=true;el('reservationOffer').focus();});
el('inquiryEmail').addEventListener('click',()=>{el('draftStatus').textContent='Opening your email app does not send the inquiry. If no app opens, copy the message below.';});
window.addEventListener('pagehide',()=>{el('reservationForm').reset();el('inquiryText').value='';el('inquiryEmail').removeAttribute('href');el('inquiryDraft').hidden=true;});
