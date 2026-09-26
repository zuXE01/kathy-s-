import { getAuthClient } from './auth-client.js';
import { contactDetails } from './account-model.js';
export async function loadContact(userId) {
  const client = await getAuthClient();
  const {data,error} = await client.from('customer_details').select('name,phone,address,barangay,city,province,postal,notes').eq('user_id',userId).maybeSingle();
  if (error) throw new Error('Saved details are unavailable. Please try again.');
  return data;
}
export async function saveContact(userId, values) {
  const contact = contactDetails(values), client = await getAuthClient();
  const {data:auth,error:authError} = await client.auth.getUser();
  if (authError || !auth.user || auth.user.id !== userId) throw new Error('Your session changed. Sign in again before saving.');
  const {error} = await client.from('customer_details').upsert({user_id:userId,...contact},{onConflict:'user_id'});
  if (error) throw new Error('Unable to save your details. Please retry.');
  return contact;
}
