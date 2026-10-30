import { getAuthClient } from './auth-client.js';
import { orderRequest } from './order-api.js';
const labels={accepted:'Your order was accepted.',preparing:'Your order is being prepared.',ready:'Your order is ready.',completed:'Your order was completed.',rejected:'Your order was rejected. Open Orders for details.',cancelled:'Your order was cancelled.'};
const panel=document.createElement('details');panel.className='order-notifications';panel.hidden=true;
const summary=document.createElement('summary');summary.textContent='Order updates';
const message=document.createElement('p');message.setAttribute('role','status');
const list=document.createElement('ul'),read=document.createElement('button');read.type='button';read.textContent='Mark displayed updates read';
panel.append(summary,message,list,read);document.querySelector('main')?.prepend(panel);
let user=null,generation=0,timer=null,busy=false,rows=[],displayed=[],paused=false,announced=new Set();
function stop(){clearTimeout(timer);timer=null;}
function schedule(){stop();if(user&&!paused&&!document.hidden)timer=setTimeout(refresh,15000);}
async function refresh(){
 if(!user||document.hidden||busy)return;
 const current=generation;busy=true;
 try{
  const data=await orderRequest('/api/orders/notifications',{signal:AbortSignal.timeout(12000)});
  if(current!==generation)return;
  rows=data.items;const unread=rows.filter(row=>!row.read_at);
  summary.textContent='Order updates'+(unread.length?' ('+unread.length+' unread)':'');
  const fresh=unread.filter(row=>!announced.has(row.id));
  if(fresh.length)message.textContent=fresh.length+' unread order update'+(fresh.length===1?'':'s')+'. Open Order updates to view.';
  unread.forEach(row=>announced.add(row.id));
  // Keep links stable while a customer reads or interacts with the open panel.
  if(!panel.open||!panel.contains(document.activeElement)){
   displayed=rows;list.replaceChildren();rows.forEach(row=>{const li=document.createElement('li'),a=document.createElement('a');a.href='/orders.html';a.textContent=(row.read_at?'':'Unread · ')+row.order_id.slice(0,8)+' · '+(labels[row.status]||'Order status updated.')+' '+new Date(row.created_at).toLocaleString();li.append(a);list.append(li);});
  }
  read.disabled=!displayed.some(row=>!row.read_at);
  if(!rows.length)message.textContent='No order updates yet. Updates appear here after the restaurant changes your order status.';
 }catch(error){if(current===generation){message.textContent='Updates unavailable. Open Orders to check status.';if(error.status===401||error.status===403){panel.hidden=true;user=null;}if(error.status===429){paused=true;stop();message.textContent="Too many checks. Open Orders or reload later to retry.";return;}}}
 finally{if(current===generation){busy=false;schedule();}}
}
read.addEventListener('click',async()=>{if(busy)return;const current=generation;read.disabled=true;try{await orderRequest('/api/orders/notifications/read',{method:'POST',body:JSON.stringify({ids:displayed.filter(row=>!row.read_at).map(row=>row.id)})});if(current===generation)refresh();}catch{if(current===generation){message.textContent='Unable to mark updates read. Try again.';read.disabled=false;}}});
document.addEventListener('visibilitychange',()=>{stop();if(!document.hidden)refresh();});
window.addEventListener('pagehide',()=>{generation++;stop();user=null;});
getAuthClient().then(client=>client.auth.onAuthStateChange((event,session)=>{
 const next=event==='SIGNED_OUT'?null:session?.user?.id;if(next===user)return;
 generation++;stop();busy=false;paused=false;user=next;rows=[];displayed=[];announced=new Set();list.replaceChildren();message.textContent='';panel.open=false;panel.hidden=!user;
 if(user)setTimeout(refresh,0);
})).catch(()=>{panel.hidden=true;});
