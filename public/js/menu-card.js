// Shared by the member catalog and admin manager. Database text never becomes HTML.
export const formatPrice = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);
export function getOptions(item) {
  const options = Array.isArray(item.variants) ? item.variants.filter(option => option && typeof option.label === 'string' && Number.isFinite(Number(option.price))) : [];
  return options.length ? options : [{ label: 'Regular', price: Number(item.price) }];
}
export function createMenuCard(item, { onEdit, onRemove, onAdd } = {}) {
  const node = (tag, className, text) => { const element = document.createElement(tag); element.className = className; if (text !== undefined) element.textContent = text; return element; };
  const card = node('article', 'catalog-card');
  const top = node('div','catalog-card-top');
  const mark = node('span','catalog-symbol', {coffee:'☕',bites:'🍽',sweet:'🍰'}[item.category] || '🍽'); mark.setAttribute('aria-hidden','true');
  top.append(mark, node('span','catalog-section', item.section || 'House Favorites'));
  card.append(top, node('h3','catalog-name',item.name));
  if (item.description) card.append(node('p','catalog-description',item.description));
  const options = getOptions(item), footer = node('div','catalog-card-footer');
  let selected = 0;
  const price = node('strong','catalog-price',formatPrice(options[0].price)); price.setAttribute('aria-live','polite');
  const label = node('label','catalog-option-label',options.length > 1 ? 'Choose size / portion' : options[0].label);
  if (options.length > 1) {
    const select = node('select','catalog-option'); select.setAttribute('aria-label','Size or portion for ' + item.name);
    options.forEach((option,index) => { const choice = node('option','',option.label + ' — ' + formatPrice(option.price)); choice.value = index; select.append(choice); });
    select.addEventListener('change', function changeSize() { selected = Number(select.value); price.textContent = formatPrice(options[selected].price); });
    label.append(select);
  }
  footer.append(label,price); card.append(footer);
  if (onAdd) {
    const add = node('button','cart-add','Add to cart'); add.type = 'button';
    add.setAttribute('aria-label','Add ' + item.name + ' to cart');
    add.addEventListener('click',()=>onAdd(item,options[selected])); footer.append(add);
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
