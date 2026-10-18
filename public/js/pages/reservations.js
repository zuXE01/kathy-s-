import { reservationOffers, alaCarte, manilaToday, prepareReservationInquiry } from '../reservation-offers.js';
import { offerHighlights, selectionContext, offerPriceLabel } from '../reservation-selection.js';
const el=id=>document.getElementById(id);
const node=(tag,text,className)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(className)item.className=className;return item;};
const money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(value);
const familyNames={general:'Birthdays, baptisms & general occasions',debut:'Debut',wedding:'Wedding',venue:'Venue rental only'};
const tierSelections=new Map();
const form=el('reservationForm'),guests=form.elements.guests;
let draftVersion=0,dirty=false;
function invalidateDraft(){
  draftVersion++;el('inquiryDraft').hidden=true;el('inquiryText').value='';el('inquiryEmail').removeAttribute('href');el('draftStatus').textContent='';el('inquiryError').textContent='';
}
const selection=node('section',undefined,'selection-summary');selection.id='selectionSummary';selection.hidden=true;selection.setAttribute('aria-label','Selected package');form.prepend(selection);
const capacityHelp=node('span',undefined,'fine');capacityHelp.id='capacityHelp';
const guestError=node('span',undefined,'guest-error');guestError.id='guestError';guestError.setAttribute('aria-live','polite');
guests.id='reservationGuests';guests.setAttribute('aria-describedby','capacityHelp guestError');guests.after(capacityHelp,guestError);
function syncSelection(){
  const offer=reservationOffers.find(item=>item.id===el('reservationOffer').value);
  const state=selectionContext(offer,guests.value);guests.max=state.maximum;
  capacityHelp.textContent=offer?.capacity?'Listed capacity: up to '+state.maximum+' guests.':'For more than 100 guests, contact Kathy’s Hub directly.';
  const error=state.overCapacity?'Maximum '+state.maximum+' guests'+(offer?' for '+offer.name:'')+'. Choose another offer or contact us.':'';
  guests.setCustomValidity(error);guestError.textContent=error;
  if(error)guests.setAttribute('aria-invalid','true');else guests.removeAttribute('aria-invalid');
  selection.replaceChildren();selection.hidden=!offer;if(!offer)return;
  selection.append(node('h3',offer.name),node('p',guests.value?'Your guest count: '+guests.value:'Enter your guest count below.'));
  let reference=guests.value?'No listed package price for this guest count. Ask Kathy’s Hub for a quote.':'Enter guests to see the matching brochure price, if listed.';
  if(state.rate)reference='Brochure price for '+state.rate.guests+' guests: '+money(state.rate.price)+(offer.perGuest?' per guest':' for the package');
  else if(offer.family==='venue')reference='Venue rates: '+offer.rates.map(rate=>rate.label+' — '+money(rate.price)).join(' · ')+'. Confirm the duration and final price with Kathy’s Hub.';
  selection.append(node('p',reference),node('p','Availability and final quotation require restaurant confirmation.','fine'));
  const list=node('ul');offerHighlights(offer).forEach(text=>list.append(node('li',text)));selection.append(list);
  const source=node('a','Review original brochure (new tab)');source.href='/assets/reservations/'+offer.source;source.target='_blank';source.rel='noopener';selection.append(source);
}
function renderOffers(){
  const matches=reservationOffers.filter(offer=>el('offerFamily').value==='all'||offer.family===el('offerFamily').value);
  el('offerList').replaceChildren();
  for(const offer of matches){
    const article=node('article',undefined,'offer');article.dataset.offer=offer.id;article.append(node('h3',offer.name),node('p',familyNames[offer.family],'offer-type'));
    article.append(node('p',offerPriceLabel(offer,money),'offer-price'));
    if(offer.capacity)article.append(node('p','Listed capacity: up to '+offer.capacity+' guests.'));
    // Guest-tier prices already appear in the selector; only venue durations need a separate comparison.
    if(offer.family==='venue'&&offer.rates.length>1){
      const rates=node('dl',undefined,'rate-list');for(const rate of offer.rates){const row=node('div');row.append(node('dt',rate.label),node('dd',money(rate.price)));rates.append(row);}article.append(rates);
    }
    const highlights=node('ul',undefined,'offer-highlights');offerHighlights(offer).forEach(text=>highlights.append(node('li',text)));article.append(highlights);
    if(offer.rates.some(rate=>rate.guests)){
      const label=node('label','Guest count (optional — fills the inquiry)');const picker=node('select');picker.append(node('option','Enter a different count in the form'));
      picker.options[0].value='';for(const rate of offer.rates){const option=node('option',rate.guests+' guests — '+money(rate.price)+(offer.perGuest?' / guest':''));option.value=rate.guests;picker.append(option);}
      picker.value=tierSelections.get(offer.id)||'';picker.addEventListener('change',()=>tierSelections.set(offer.id,picker.value));label.append(picker);article.append(label);
    }
    const choose=node('button','Inquire about '+offer.name,'primary');choose.type='button';choose.addEventListener('click',()=>{el('reservationOffer').value=offer.id;const tier=tierSelections.get(offer.id);if(tier)guests.value=tier;dirty=true;invalidateDraft();syncSelection();el('inquiry').scrollIntoView({block:'start'});el('reservationOffer').focus();});article.append(choose);
    if(offer.rates.some(rate=>'additionalGuest' in rate)){
      const details=node('details');details.append(node('summary','Additional guest rates'));
      const list=node('ul');offer.rates.forEach(rate=>list.append(node('li',rate.guests+'-guest tier: '+(rate.additionalGuest?money(rate.additionalGuest)+' per additional guest':'confirm the rate with the restaurant (brochure text unclear)'))));
      details.append(list,node('p','Additional guests require capacity and pricing confirmation. These rates are not an automatic quotation.','fine'));article.append(details);
    }
    const included=node('details');included.append(node('summary','Everything included'));const list=node('ul');[...new Set(offer.inclusions)].forEach(text=>list.append(node('li',text)));included.append(list);article.append(included);
    if(offer.notes)article.append(node('p',offer.notes,'fine'));
    if(offer.food){const details=node('details');details.append(node('summary','Food choices'));for(const [group,choices] of Object.entries(offer.food)){const block=node('div',undefined,'food-group');block.append(node('h4',group),node('p',choices.join(' · ')));details.append(block);}details.append(node('p','Confirm the number of dishes and any substitutions in your quotation.','fine'));article.append(details);}
    if(offer.extras){const details=node('details');details.append(node('summary','Package add-ons and extra charges'));const list=node('ul');offer.extras.forEach(text=>list.append(node('li',text)));details.append(list,node('p','Some services may already be included. Ask before adding them; do not add these rates to à-la-carte rates.','fine'));article.append(details);}
    const source=node('a','Open original brochure (new tab)','source-link');source.href='/assets/reservations/'+offer.source;source.target='_blank';source.rel='noopener';article.append(source);
    el('offerList').append(article);
  }
  el('offerStatus').textContent=matches.length+' offer'+(matches.length===1?'':'s')+' shown. Select an offer to prepare an inquiry.';
}
for(const offer of reservationOffers){const option=node('option',offer.name);option.value=offer.id;el('reservationOffer').append(option);}
for(const [service,price] of alaCarte)el('extraList').append(node('dt',service),node('dd',price));
el('reservationDate').min=manilaToday();el('offerFamily').addEventListener('change',renderOffers);renderOffers();
el('reservationOffer').addEventListener('change',syncSelection);guests.addEventListener('input',syncSelection);syncSelection();
el('reservationForm').addEventListener('input',()=>{dirty=true;invalidateDraft();});
el('reservationForm').addEventListener('change',()=>{dirty=true;invalidateDraft();});
el('reservationForm').addEventListener('submit',event=>{
  event.preventDefault();el('inquiryError').textContent='';
  try{
    el('reservationDate').min=manilaToday();
    const values=Object.fromEntries(new FormData(event.currentTarget));
    const draft=prepareReservationInquiry(values);el('inquiryText').value=draft.text;el('inquiryEmail').href=draft.href;
    el('draftStatus').textContent='';el('inquiryDraft').hidden=false;el('draft-title').focus();
  }catch(error){el('inquiryDraft').hidden=true;el('inquiryError').textContent=error.message;el('inquiryError').focus();}
});
el('copyInquiry').addEventListener('click',async()=>{
  if(el('inquiryDraft').hidden||!el('inquiryText').value)return;
  const version=draftVersion,text=el('inquiryText').value,button=el('copyInquiry');button.disabled=true;
  try{await navigator.clipboard.writeText(text);if(version!==draftVersion)return;el('draftStatus').textContent='Message copied. Paste it into an email to kathyshub08@gmail.com and send it yourself.';}
  catch{if(version!==draftVersion)return;el('inquiryText').focus();el('inquiryText').select();el('draftStatus').textContent='Automatic copying is unavailable. Copy the selected message and email kathyshub08@gmail.com.';}
  finally{button.disabled=false;}
});
el('editInquiry').addEventListener('click',()=>{invalidateDraft();el('reservationOffer').focus();});
el('inquiryEmail').addEventListener('click',()=>{el('draftStatus').textContent='Opening your email app does not send the inquiry. If no app opens, copy the message below.';});
window.addEventListener('beforeunload',event=>{if(!dirty)return;event.preventDefault();event.returnValue='';});
window.addEventListener('pageshow',()=>{el('reservationDate').min=manilaToday();syncSelection();});
window.addEventListener('pagehide',()=>{dirty=false;el('reservationForm').reset();syncSelection();invalidateDraft();});
