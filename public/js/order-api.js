import { getAuthClient } from './auth-client.js';
export async function orderRequest(path,options={}) {
  const client=await getAuthClient();
  const {data,error}=await client.auth.getSession();
  if(error||!data.session)throw new Error('Please sign in from the menu before checking out.');
  const response=await fetch(path,{...options,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token}});
  const result=await response.json();
  if(!response.ok)throw Object.assign(new Error(result.error||'Unable to save the order.'),{status:response.status});
  return result;
}
