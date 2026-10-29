// Run against test/admin-preview.cjs only; never signs into a real account.
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require(process.env.MENU_PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.MENU_BROWSER_PATH});
 try{
  const page=await browser.newPage();
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:3102/#menu',{waitUntil:'domcontentloaded'});
  await page.locator('#catalogGrid .catalog-card').first().waitFor();
  for(let i=0;i<12&&await page.locator('#catalogMore').isVisible();i++)await page.locator('#catalogMore').click();
  await page.evaluate(async()=>{const photos=[...document.querySelectorAll('#catalogGrid img')];await Promise.all(photos.map(async photo=>{photo.loading='eager';await photo.decode();}));});
  const output=path.resolve(__dirname,'../.impeccable/review');await fs.mkdir(output,{recursive:true});
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});
   await page.locator('#catalogGrid').scrollIntoViewIfNeeded();
   const report=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,cards:document.querySelectorAll('#catalogGrid .catalog-card').length,photos:[...document.querySelectorAll('#catalogGrid img')].filter(image=>image.complete&&image.naturalWidth>0).length,references:document.querySelectorAll('#catalogGrid .catalog-photo-credit').length}));
   if(report.scrollWidth>width||report.cards!==120||report.photos<120||report.references!==110)throw Error(JSON.stringify(report));
   await page.screenshot({path:path.join(output,'menu-photos-'+width+'.png')});console.log(report);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
