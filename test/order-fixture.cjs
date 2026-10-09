// In-memory order adapter for tests only. Live validation is enforced by database triggers.
const {randomUUID}=require('node:crypto');
const {transitions}=require('../server/orders');
const memberId='00000000-0000-4000-8000-000000000010';
const otherId='00000000-0000-4000-8000-000000000011';
function createOrderFixture(menu) {
  const orders=[];
  function client(_url,_key,options={}) {
    const token=options.global?.headers?.Authorization?.split(' ')[1]||'member';
    const user={id:token==='other'?otherId:memberId,email:'demo@example.test',user_metadata:{name:'Demo member'},app_metadata:token==='admin'?{hub_role:'admin'}:{}};
    return {
      auth:{getUser:async()=>({data:{user:token==='invalid'?null:user}})},
      rpc:async(name,{order_ids})=>({data:orders.filter(row=>order_ids.includes(row.id)&&(token==='admin'||row.user_id===user.id)).map(({id,customer})=>({id,customer:structuredClone(customer)})),error:null}),
      from(table) {
        let filters=[],start=0,end=19,action,payload,single=false,columns='*',sorts=[];
        const query={
          select(value='*'){columns=value;return this;},eq(key,value){filters.push([key,value]);return this;},
          in(key,values){filters.push([key,values]);return this;},order(key,{ascending=true}={}){sorts.push([key,ascending]);return this;},
          range(a,b){start=a;end=b;return this;},maybeSingle(){single=true;return this;},single(){single=true;return this;},
          insert(value){action='insert';payload=value;return this;},update(value){action='update';payload=value;return this;},
          then(resolve,reject) {
            let error=null,rows=orders.filter(row=>(token==='admin'||row.user_id===user.id)&&filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value));
            rows.sort((a,b)=>{for(const [key,ascending] of sorts){if(a[key]!==b[key])return (a[key]<b[key]?-1:1)*(ascending?1:-1);}return 0;});
            if(table!=='orders')return Promise.reject(new Error('Unknown fixture table')).then(resolve,reject);
            if(action==='insert') {
              if(orders.some(row=>row.user_id===payload.user_id&&row.request_id===payload.request_id))error={code:'23505'};
              else {
                let total=0;
                const items=payload.items.map(line=>{
                  const product=menu.find(item=>item.id===line.product_id&&item.available!==false);
                  const option=product&&(product.variants.length?product.variants:[{label:'Regular',price:product.price}]).find(option=>option.label===line.label);
                  if(!option){error={code:'P0001'};return {};}
                  const cents=Math.round(option.price*100);total+=cents*line.quantity;
                  return {...line,name:product.name,section:product.section,cents};
                });
                if(total!==payload.total_cents)error={code:'P0001'};
                if(!error) {
                  const now=new Date().toISOString(),row={...payload,id:randomUUID(),items,total_cents:total,status:'pending',status_note:'',payment_status:payload.payment_method==='cod'?'unpaid':'simulated',delivery_cents:0,is_demo:true,version:1,created_at:now,updated_at:now,history:[{status:'pending',at:now,actor:user.id,note:'Order submitted'}]};
                  orders.unshift(row);rows=[row];
                }
              }
            }
            if(action==='update') {
              if(token!=='admin' && payload.status!=='cancelled')error={code:'42501'};
              else if(rows.some(row=>!transitions[row.status].includes(payload.status)))error={code:'P0001'};
              else rows.forEach(row=>{Object.assign(row,payload);row.version++;row.updated_at=new Date().toISOString();row.history.push({status:row.status,note:row.status_note,actor:user.id,at:row.updated_at});});
            }
            const project=row=>structuredClone(columns==='*'?row:Object.fromEntries(columns.split(',').map(key=>[key,row[key]])));
            return Promise.resolve({data:error?null:single?(rows[0]?project(rows[0]):null):rows.slice(start,end+1).map(project),count:rows.length,error}).then(resolve,reject);
          }
        };return query;
      }
    };
  }
  return {client,orders};
}
module.exports={createOrderFixture,memberId};
