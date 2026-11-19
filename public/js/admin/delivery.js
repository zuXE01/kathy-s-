import { request } from './request.js';

export function addDeliveryControls(container, id) {
  const section = document.createElement('details');
  const title = document.createElement('summary');
  title.textContent = 'Lalamove sandbox delivery';
  section.append(title);
  const notice = document.createElement('p');
  notice.setAttribute('role', 'status');
  const instructions = document.createElement('p');
  instructions.textContent = 'Use a public test address and its map coordinates. The sandbox fee is separate from the customer total.';
  section.append(instructions, notice);
  const controls = document.createElement('div');
  section.append(controls);
  const input = (parent, label, placeholder) => {
    const wrapper = document.createElement('label');
    wrapper.style.display = 'block';
    wrapper.textContent = label + ' ';
    const field = document.createElement('input');
    field.placeholder = placeholder;
    field.required = true;
    wrapper.append(field);
    parent.append(wrapper);
    return field;
  };
  function run(action, payload = {}) {
    controls.querySelectorAll('button').forEach(button => { button.disabled = true; });
    notice.textContent = 'Checking Lalamove…';
    request('/delivery/' + id, { method: 'POST', body: JSON.stringify({ action, ...payload }) }, (error, data) => {
      if (!section.isConnected) return;
      if (error) {
        controls.replaceChildren();
        notice.textContent = error.message;
        button('Reload delivery', () => run('view'));
        return;
      }
      render(data);
    });
  }
  function button(label, callback) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'admin-button';
    element.textContent = label;
    element.style.minHeight = '48px';
    element.addEventListener('click', callback);
    controls.append(element);
  }
  function render(data) {
    controls.replaceChildren();
    notice.textContent = data.status.replaceAll('_', ' ') + (data.providerId ? ' · ' + data.providerId : '');
    if (data.quote) {
      notice.textContent = 'Sandbox quote ₱' + data.quote.total + ' · expires ' + new Date(data.quote.expiresAt).toLocaleTimeString();
      button('Book sandbox delivery', () => {
        if (window.confirm('Book this sandbox delivery for ₱' + data.quote.total + '?')) run('book', { quoteId: data.quote.id });
      });
    }
    if (data.providerId) {
      button('Refresh delivery status', () => run('refresh'));
      if (!['COMPLETED', 'CANCELED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(data.status)) {
        button('Cancel sandbox delivery', () => { if (window.confirm('Cancel this sandbox delivery?')) run('cancel'); });
      }
    } else if (data.status === 'BOOKING_UNCONFIRMED') {
      const providerId = input(controls, 'Lalamove order ID from Partner Portal', 'Order ID');
      button('Recover booking', () => run('recover', { providerId: providerId.value.trim() }));
    } else {
      const address = input(controls, 'Test drop-off address', 'Public test location');
      address.maxLength = 250;
      const lat = input(controls, 'Latitude', '14.50');
      const lng = input(controls, 'Longitude', '121.00');
      lat.inputMode = lng.inputMode = 'decimal';
      button('Get sandbox quote', () => run('quote', { address: address.value, lat: lat.value.trim(), lng: lng.value.trim() }));
    }
  }
  section.addEventListener('toggle', () => { if (section.open && !controls.children.length) run('view'); });
  request('/delivery/config', {}, (error, data) => {
    if (!error && data.enabled && container.isConnected && document.querySelector('#orderDetails') === container &&
        container.textContent.includes(id)) container.append(section);
  });
}
