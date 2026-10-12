// One bounded recovery pass for an external scheduler. Uses server-only environment.
const {createClient}=require('@supabase/supabase-js');
const {mayaConfig,createMayaClient}=require('../server/maya-client.cjs');
const {createReliablePaymentService}=require('../server/maya-reliability.cjs');
async function main(){
 const config=mayaConfig(process.env);
 if(!config||process.env.MAYA_RELIABILITY_ENABLED!=='true')throw new Error('Enable sandbox reliability after database setup.');
 const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await createReliablePaymentService(db,createMayaClient(config)).reconcile({limit:50});
 console.log(JSON.stringify(result));if(result.failed)process.exitCode=1;
}
main().catch(()=>{console.error('Payment reconciliation unavailable. Check server settings and payment investigation.');process.exitCode=1;});
