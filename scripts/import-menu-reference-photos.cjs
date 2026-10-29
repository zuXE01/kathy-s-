// Explicit, reviewed sources only. Never overwrite existing photos or their derivatives.
// Usage: node scripts/import-menu-reference-photos.cjs
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const sources=require('./menu-reference-sources.json');
const root=path.resolve(__dirname,'../public/assets/menu');
const sharp=require(process.env.MENU_SHARP_PATH||'sharp');
const local={
 'provided-autumn-frappe':'autumn sunrise frappe.jpg',
 'provided-biscoff-frappe':'biscoff frappe.jpg',
 'provided-biscoff-waffle':'biscoff waffles.jpg'
};
async function exists(file){try{await fs.access(file);return true;}catch{return false;}}
async function run(){
 const baseline=new Map();
 for(const name of await fs.readdir(root))baseline.set(name,crypto.createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex'));
 const entries=[...Object.entries(sources),...Object.entries(local).map(([name,file])=>[name,{file}])];
 const failures=[];
 async function download([name,source]){
  try{
   if(await exists(path.join(root,name+'-400.webp'))&&await exists(path.join(root,name+'-800.webp')))return;
   let bytes;
   if(source.file)bytes=await fs.readFile(path.join(root,source.file));
   else{
    let url=source.image+'?auto=format&fit=max&w=1200&q=85';
    if(source.filename){const hash=crypto.createHash('md5').update(source.filename).digest('hex'),file=encodeURIComponent(source.filename);url='https://upload.wikimedia.org/wikipedia/commons/thumb/'+hash[0]+'/'+hash.slice(0,2)+'/'+file+'/'+(source.thumbnailWidth||960)+'px-'+file;}
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
    if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw Error('Image response '+response.status);
    bytes=Buffer.from(await response.arrayBuffer());
   }
   for(const width of [400,800]){
    const target=path.join(root,name+'-'+width+'.webp');if(await exists(target))continue;
    const output=await sharp(bytes).rotate().resize({width,withoutEnlargement:true}).webp({quality:76,effort:5}).toBuffer();
    await fs.writeFile(target,output,{flag:'wx'});
   }
   console.log('Imported '+name);
  }catch(error){failures.push({name,error:error.message});}
 }
 // Keep requests modest; Wikimedia can rate-limit bursts of image downloads.
 for(const entry of entries)await download(entry);
 for(const [name,hash]of baseline){const after=crypto.createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex');if(after!==hash)throw Error('Existing photo changed: '+name);}
 console.log(JSON.stringify({existingFilesPreserved:baseline.size,photoSources:entries.length,failures}));
 if(failures.length)process.exitCode=1;
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
