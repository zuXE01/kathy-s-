export const contactFields = ['name','phone','address','barangay','city','province','postal','notes'];
export function contactDetails(source) {
  const result = {};
  for (const field of contactFields) {
    const value = source[field] ?? '';
    if (typeof value !== 'string' || value.trim().length > (field === 'notes' ? 500 : field === 'address' ? 200 : field === 'phone' ? 20 : 100)) throw new Error('Check the length of your contact details.');
    result[field] = value.trim();
  }
  if (!result.name) throw new Error('Enter your full name.');
  if (result.phone && (!/^\+?[\d ()-]{7,20}$/.test(result.phone) || result.phone.replace(/\D/g,'').length < 7)) throw new Error('Enter a valid phone number.');
  if (result.postal && !/^\d{4}$/.test(result.postal)) throw new Error('Enter a four-digit Philippine postal code.');
  return result;
}
export function prefillContact(form, contact) {
  for (const field of contactFields) {
    if (form.elements[field] && typeof contact?.[field] === 'string') form.elements[field].value = contact[field];
  }
}
