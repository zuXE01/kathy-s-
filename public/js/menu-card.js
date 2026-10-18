// Shared by the member catalog and admin manager. Database text never becomes HTML.
// Explicit section/name pairs prevent similarly named waffles, frappes and cookies sharing a photo.
export const menuPhotos = {
  'cream cheese series|ube cream cheese':['ube-cream-cheese'],
  'cream cheese series|red velvet cream cheese':['red-velvet-cream-cheese'],
  'pizza thin crust|meaty':['meaty-pizza'],
  'desserts|biscoff cookie':['biscoff-cookie-1','biscoff-cookie-2'],
  'desserts|chocolate chip walnut':['chocolate-chip-walnut-1','chocolate-chip-walnut-2'],
  'desserts|cookies and cream':['cookies-and-cream-cookie-1','cookies-and-cream-cookie-2'],
  'desserts|double chocolate chip':['double-chocolate-chip'],
  'desserts|chocolate chip oat':['chocolate-chip-oat'],
  'soda pop|kiwi':['kiwi-soda'],
  'soda pop|passion fruit':['passion-fruit-soda']
};
export function getMenuPhotos(item){
  const normalize=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
  return menuPhotos[normalize(item.section)+'|'+normalize(item.name)]||[];
}
export const formatPrice = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);
export function getOptions(item) {
  const options = Array.isArray(item.variants) ? item.variants.filter(option => option && typeof option.label === 'string' && Number.isFinite(Number(option.price))) : [];
  return options.length ? options : [{ label: 'Regular', price: Number(item.price) }];
}
export function createMenuCard(item, { onEdit, onRemove, onAdd, selectedLabel, onOptionChange } = {}) {
  const node = (tag, className, text) => { const element = document.createElement(tag); element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const card = node('article', 'catalog-card');
  const photos=getMenuPhotos(item);
  const photo=(name,index)=>{
    const image=node('img','catalog-photo');
    image.src='/assets/menu/'+name+'-800.webp';
    image.srcset='/assets/menu/'+name+'-400.webp 400w, /assets/menu/'+name+'-800.webp 800w';
    image.sizes='(min-width:900px) 380px, (min-width:600px) 45vw, 90vw';
    image.alt=item.name+' — '+item.section+(index?' (additional view)':'');
    image.loading='lazy';image.decoding='async';image.width=800;image.height=800;
    image.addEventListener('error',()=>{image.hidden=true;});
    return image;
  };
  if(photos.length)card.append(photo(photos[0],0));
  const top = node('div','catalog-card-top');
  const mark = node('span','catalog-symbol', {coffee:'☕',bites:'🍽',sweet:'🍰'}[item.category] || '🍽'); mark.setAttribute('aria-hidden','true');
  top.append(mark, node('span','catalog-section', item.section || 'House Favorites'));
  card.append(top, node('h3','catalog-name',item.name));
  if (item.description) card.append(node('p','catalog-description',item.description));
  if(photos.length>1){
    const views=node('details','catalog-photo-views');
    views.append(node('summary','','More photos'));
    photos.slice(1).forEach((name,index)=>views.append(photo(name,index+1)));
    card.append(views);
  }
  const options = getOptions(item), footer = node('div','catalog-card-footer');
  let selected = Math.max(0, options.findIndex(option => option.label === selectedLabel));
  const price = node('strong','catalog-price',formatPrice(options[selected].price)); price.setAttribute('aria-live','polite');
  const label = node('label','catalog-option-label',options.length > 1 ? 'Choose size / portion' : options[0].label);
  if (options.length > 1) {
    const select = node('select','catalog-option'); select.setAttribute('aria-label','Size or portion for ' + item.name);
    options.forEach((option,index) => { const choice = node('option','',option.label + ' — ' + formatPrice(option.price)); choice.value = index; select.append(choice); });
    select.value = String(selected);
    select.addEventListener('change', function changeSize() {
      const next = Number(select.value);
      if (!Number.isInteger(next) || !options[next]) return;
      selected = next; price.textContent = formatPrice(options[selected].price);
      onOptionChange?.(options[selected].label);
    });
    label.append(select);
  }
  footer.append(label,price); card.append(footer);
  if (onAdd) {
    const add = node('button','cart-add','Add to cart'); add.type = 'button';
    add.setAttribute('aria-label','Add ' + item.name + ' to cart');
    const check = node('span','cart-add-check','✓'); check.setAttribute('aria-hidden','true');
    const caption = node('span','cart-add-caption','Add to cart');
    add.textContent = ''; add.append(check,caption);
    let resetFeedback;
    add.addEventListener('click',event=>{
      const added = onAdd(item,options[selected]);
      clearTimeout(resetFeedback);
      // Keyboard activation gets the same confirmation without movement.
      add.toggleAttribute('data-instant',event.detail === 0);
      add.toggleAttribute('data-added',added === true);
      caption.textContent = added === true ? 'Added!' : 'Limit reached';
      add.setAttribute('aria-label',added === true ? item.name + ' added. Add another to cart' : 'Maximum quantity reached for ' + item.name);
      resetFeedback = setTimeout(()=>{
        add.toggleAttribute('data-added',false);
        caption.textContent = 'Add to cart';
        add.setAttribute('aria-label','Add ' + item.name + ' to cart');
      },2200);
    }); footer.append(add);
  }
  if (onEdit) {
    card.append(node('span','catalog-availability',item.available ? 'Available' : 'Hidden from members'));
    const actions = node('div','catalog-actions');
    [['Edit',onEdit],['Remove',onRemove]].forEach(([text,handler]) => {
      if (!handler) return;
      const button = node('button','admin-button secondary',text); button.type = 'button'; button.addEventListener('click', () => handler(item)); actions.append(button);
    });
    card.append(actions);
  }
  return card;
}
