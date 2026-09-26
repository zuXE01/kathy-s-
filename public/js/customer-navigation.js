import { getAuthClient } from './auth-client.js';
import { forgetCart } from './cart-storage.js';
import { signInPath } from './routes.js';
const destination=location.pathname==='/account.html'
  ? '/account.html'+(new URLSearchParams(location.search).get('from')==='checkout'?'?from=checkout':'')
  : location.pathname==='/checkout.html'?'/checkout.html':location.pathname==='/orders.html'?'/orders.html':'/#menu';
function displayUser(user) {
  document.querySelectorAll('[data-signin]').forEach(link=>{link.href=signInPath(destination);link.hidden=!!user;});
  document.querySelectorAll('[data-signout]').forEach(button=>{button.hidden=!user;});
  document.querySelectorAll('[data-admin]').forEach(link=>{link.hidden=!['admin','owner','platform_admin','staff','kitchen_staff'].includes(user?.app_metadata?.hub_role);});
  document.querySelectorAll('[data-auth-prompt]').forEach(item=>{item.hidden=!!user;});
}
displayUser(null);
const callbackHash=new URLSearchParams(location.hash.slice(1));
const isEmailCallback=callbackHash.has('access_token')||callbackHash.has('error')||new URLSearchParams(location.search).has('code');
if(!isEmailCallback)getAuthClient().then(client=>{
  let revision=0;
  client.auth.onAuthStateChange((event,session)=>{
    const current=++revision;
    if(!session){displayUser(null);return;}
    setTimeout(async()=>{
      try {const {data,error}=await client.auth.getUser();if(current===revision)displayUser(error?null:data.user);}
      catch {if(current===revision)displayUser(null);}
    },0);
  });
  document.querySelectorAll('[data-signout]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try {const {error}=await client.auth.signOut();if(error)throw error;forgetCart();location.replace('/');}
    catch {button.textContent='Retry sign out';button.disabled=false;}
  }));
}).catch(()=>displayUser(null));
