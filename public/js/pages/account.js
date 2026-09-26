import { getAuthClient } from '../auth-client.js';
import { loadContact, saveContact } from '../account-client.js';
import { prefillContact } from '../account-model.js';
import { showSkeleton } from '../loading.js';
const el = id => document.getElementById(id);
const fromCheckout = new URLSearchParams(location.search).get('from') === 'checkout';
if (fromCheckout) {
  document.querySelector('header a').href='/checkout.html';
  document.querySelector('header a').textContent='← Back to checkout';
  el('returnCheckout').hidden=false;
}
let userId, revision=0, saving=false, subscription;
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
function clearAccount() {
  revision++; userId=null; el('accountForm').reset(); el('accountContent').hidden=true;
  ['accountEmail','accountBirthday','accountGender','accountError'].forEach(id=>el(id).textContent='');
  el('accountStatus').textContent='Your session changed. Return to the menu and sign in.';
}
async function loadAccount() {
  const current=++revision, finish=showSkeleton(el('accountLoading'),2);
  el('accountRetry').hidden=true;
  try {
    const client=await getAuthClient();
    subscription?.unsubscribe();
    subscription=client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'||(userId&&session?.user?.id&&session.user.id!==userId))clearAccount();
    }).data.subscription;
    const {data,error}=await client.auth.getUser();
    if(current!==revision)return;
    if(error||!data.user)throw new Error('Please sign in from the menu to manage your account.');
    const user=data.user;userId=user.id;
    const contact=await loadContact(userId);
    if(current!==revision)return;
    prefillContact(el('accountForm'),contact||{name:typeof user.user_metadata?.name==='string'?user.user_metadata.name:''});
    el('accountEmail').textContent=user.email||'';
    el('accountBirthday').textContent=typeof user.user_metadata?.dob==='string'?user.user_metadata.dob:'Not provided';
    el('accountGender').textContent=typeof user.user_metadata?.gender==='string'?user.user_metadata.gender:'Not provided';
    el('accountContent').hidden=false;el('accountStatus').textContent='Changes apply to future checkouts, not orders already placed.';
  } catch(error) {if(current===revision){el('accountStatus').textContent=error.message;el('accountRetry').hidden=false;}}
  finally {finish();}
}
el('accountRetry').addEventListener('click',loadAccount);
el('accountForm').addEventListener('submit',async function save(event) {
  event.preventDefault();if(saving||!userId)return;
  const current=revision; saving=true;el('accountSave').disabled=true;el('accountSave').textContent='Saving…';el('accountError').textContent='';
  try {
    await saveContact(userId,Object.fromEntries(new FormData(this)));
    if(current===revision)el('accountStatus').textContent='Details saved. Your next checkout will use this contact information and address.';
  } catch(error){if(current===revision)el('accountError').textContent=error.message;}
  finally {saving=false;el('accountSave').disabled=false;el('accountSave').textContent='Save details';}
});
loadAccount();
