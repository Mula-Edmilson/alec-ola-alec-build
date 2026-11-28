// Real Edge layout validation of the exact transformed WebView HTML/CSS/JS; all data is synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'upstream/showcase');
const dest=path.resolve(process.argv[3]||'visual-evidence');
const runtime=path.resolve(process.argv[4]||'desktop-redesign/native/.visual-runtime/node_modules/playwright/index.mjs');
const {chromium}=await import(pathToFileURL(runtime).href);
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff'};
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1');
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep))throw Error('outside test fixture');
  const bytes=await fs.readFile(file);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
let browser;
const results=[],failures=[];
const history=JSON.parse(await fs.readFile(new URL('./alec-release-history.json',import.meta.url),'utf8'));
const version=JSON.parse(await fs.readFile(new URL('./alec-version.json',import.meta.url),'utf8')).version;
const versions=history.filter(r=>r.version===version||r.date!==null).map(r=>r.version);
try{
 await fs.mkdir(dest,{recursive:true});
 browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true});
 for(const [width,height] of [[300,410],[380,470],[480,620],[720,740]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];let scenario='startup';
  page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:'+server.address().port+'/')?route.continue():route.abort());
  const open=async(query)=>{
   scenario=query;errors.length=0;
   const route=new URLSearchParams(query).get('tab')||'home';
   await page.goto('http://127.0.0.1:'+server.address().port+'/panel/index.html?alec-layout-test&local&'+query);
   try{await page.waitForFunction(id=>{const p=document.getElementById('pane-'+id);return p&&!p.hidden&&p.childElementCount>0&&p.clientHeight>0;},route,{timeout:12000});}
   catch(e){throw Error('Failed to render '+route+'; '+JSON.stringify(await page.evaluate(()=>({visible:[...document.querySelectorAll('.pane:not([hidden])')].map(p=>({id:p.id,children:p.childElementCount})),title:document.title})))+'; JS: '+errors.join('; '),{cause:e});}
   assert.deepEqual(errors,[],'Page errors on '+route);
  };
  const measure=async(selector,label)=>{
   const result=await page.locator(selector).evaluate(p=>{
    const bounds=p.getBoundingClientRect(),right=bounds.left+p.clientWidth;
    const header=document.querySelector('.head'),hb=header.getBoundingClientRect();
    const hc=[...header.querySelectorAll('button')].filter(n=>!n.hidden&&n.getClientRects().length);
    const nodes=[...p.querySelectorAll('button,input:not([type=hidden]),select,textarea,.alec-account-group,.alec-news-card,.alec-model-head,.alec-news-item')].filter(n=>!n.closest('[hidden]')&&n.getClientRects().length);
    const outside=nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width<=0||r.left<bounds.left-1||r.right>right+2;}).map(n=>n.dataset.k||n.id||n.className);
    const controls=nodes.filter(n=>n.matches('button,input,select,textarea')&&!n.closest('.sr-only'));
    const collisions=[];
    for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
      const a=controls[i],b=controls[j];if(a.contains(b)||b.contains(a))continue;
      const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
      if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>1&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>1)collisions.push([a.dataset.k||a.id||a.textContent,b.dataset.k||b.id||b.textContent]);
    }
    p.scrollTop=p.scrollHeight;const reachable=p.scrollTop+p.clientHeight>=p.scrollHeight-2;p.scrollTop=0;
    const headerOutside=hc.filter(n=>{const r=n.getBoundingClientRect();return r.left<hb.left-1||r.right>hb.right+1||r.top<hb.top-1||r.bottom>hb.bottom+1;}).map(n=>n.id);
    const headerCollisions=[];for(let i=0;i<hc.length;i++)for(let j=i+1;j<hc.length;j++){const a=hc[i].getBoundingClientRect(),b=hc[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)headerCollisions.push([hc[i].id,hc[j].id]);}
    const paletteNodes=[...p.querySelectorAll('.switch,.chord,.cap,.field,input:not([type=range]),textarea,select,.btn'),...header.querySelectorAll('.btn')].filter(n=>!n.closest('[hidden]')&&n.getClientRects().length);
    const teal=value=>{const m=/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);if(!m)return false;const [,r,g,b]=m.map(Number);return g>r+12&&g>=b-8;};
    const paletteIssues=[];for(const n of paletteNodes){for(const pseudo of [null,'::before','::after']){const s=getComputedStyle(n,pseudo);if([s.backgroundColor,s.borderTopColor,s.color].some(teal))paletteIssues.push({control:n.dataset.k||n.id||n.className,pseudo,background:s.backgroundColor,color:s.color,border:s.borderTopColor});}}
    const english=new Set(['Connections','Routines','What I remember','Commitments','Get to know me','Look','Size','Spoken replies','Text only','Voice and text','Voice provider','Voice model','Talking','Hands-free','Voice control','Auto-listen','Wake word','Other keys','Talk','Type to me','General','Sound effects','Open at login','Scheduled jobs','Remove','Change','Run now','Pause','Resume','Sign in','Save','Cancel','Confirm','Approval','Always allow','Ask first']);
    const untranslated=[...p.querySelectorAll('button,h2,h3,option,label,.sub')].filter(n=>n.getClientRects().length&&english.has(n.textContent.trim())).map(n=>n.textContent.trim());
    return {width:p.clientWidth,height:p.clientHeight,scrollHeight:p.scrollHeight,scrollWidth:p.scrollWidth,outside,collisions,headerOutside,headerCollisions,reachable,controls:controls.length,paletteIssues,untranslated,paletteControls:paletteNodes.length};
   });
   results.push({viewport:[width,height],label,...result});
   assert.equal(result.outside.length,0,label+' clipped controls: '+JSON.stringify(result.outside));
   assert.equal(result.collisions.length,0,label+' overlapping controls: '+JSON.stringify(result.collisions));
   assert.deepEqual(result.paletteIssues,[],label+' inherited teal palette');assert.deepEqual(result.untranslated,[],label+' untranslated interface controls');
   assert.deepEqual(result.headerOutside,[],label+' header clipped');assert.deepEqual(result.headerCollisions,[],label+' header overlap');
   assert.ok(result.reachable,label+' scroll end unreachable');
   assert.ok(result.scrollWidth<=result.width+2,label+' horizontal overflow');
  };
  try{
   for(const route of ['home','conversations','vision','memory','remote','abilities','settings','about','appearance','speaking','listening','shortcuts','general']){
    try{
     await open('tab='+route);
     await page.screenshot({path:path.join(dest,route+'-'+width+'.png')});
     await measure('#pane-'+route,'page-'+route);
     const tabs=await page.locator('#pane-'+route+' [role=tab]').evaluateAll(nodes=>nodes.map(n=>n.id));
     for(const id of tabs){await page.locator('#pane-'+route+' #'+id).click();await measure('#pane-'+route,route+'-'+id);await page.screenshot({path:path.join(dest,route+'-'+id+'-'+width+'.png')});}
     const scrolled=await page.locator('#pane-'+route).evaluate(p=>{if(p.scrollHeight<=p.clientHeight+2)return false;p.scrollTop=p.scrollHeight;return true;});
     if(scrolled)await page.screenshot({path:path.join(dest,route+'-bottom-'+width+'.png')});
     assert.deepEqual(errors,[],'JavaScript errors in '+route);
    }catch(e){await page.screenshot({path:path.join(dest,'failure-'+route+'-'+width+'.png')}).catch(()=>{});failures.push({viewport:[width,height],scenario:route,message:e.message,errors:[...errors]});console.error(route+' '+width+'x'+height+': '+e.message);}
   }
   await open('tab=listening');
   const startLive=page.locator('[data-k="alec-live-actions"]');
   assert.equal(await startLive.count(),1,'Exactly one Live start button');
   assert.equal((await startLive.textContent()).trim(),'Activar Live');
   assert.equal(await page.getByText('Live + tarefas',{exact:true}).count(),0);
   const liveMessages=[];const observe=msg=>{if(msg.text().includes('[preview] would send')&&msg.text().includes('alec_live_actions_start'))liveMessages.push(msg.text());};page.on('console',observe);
   await startLive.click();await page.locator('[data-k="alec-dialog-cancel"]').click();await page.locator('#alec-confirm-dialog').waitFor({state:'detached'});assert.equal(liveMessages.length,0,'Cancel must not start Live');
   await startLive.click();await page.locator('[data-k="alec-dialog-accept"]').click();await page.locator('#alec-confirm-dialog').waitFor({state:'detached'});assert.equal(liveMessages.length,1,'Approved UI starts executor-enabled Live');page.off('console',observe);
   await open('tab=model');
   for(const tab of ['default','hybrid','crew','backups','accounts']){
    const button=page.locator('#tab-'+tab);if(!await button.count())continue;
    await button.click();await measure('#pane-model','model-'+tab);
   }
   await page.locator('#tab-accounts').click();
   await page.locator('[data-k="addkey:local-add"]').click();
   await page.locator('[data-k="alec-provider-preset"]').waitFor();
   await page.locator('[data-k="alec-provider-preset"]').selectOption('openrouter-free');
   assert.equal(await page.locator('#key-local-add').inputValue(),'OpenRouter · Free');
   assert.equal(await page.locator('#local-add-url').inputValue(),'https://openrouter.ai/api/v1');
   await measure('#pane-model','expanded-server');
   await page.screenshot({path:path.join(dest,'accounts-form-'+width+'.png')});
   await page.locator('[data-k="alec-provider-preset"]').selectOption('llamacpp');
   assert.equal(await page.locator('#local-add-url').inputValue(),'http://127.0.0.1:9931/v1');
   await page.locator('[data-k="alec-provider-preset"]').selectOption('');
   assert.equal(await page.locator('#local-add-url').inputValue(),'');
   await open('tab=model&alec-disconnected');
   await page.locator('#tab-accounts').click();await measure('#pane-model','no-connected-accounts');
   await page.screenshot({path:path.join(dest,'accounts-'+width+'.png')});
   await page.locator('[data-k="addkey:openai"]').click();
   await page.locator('#key-openai').waitFor();await measure('#pane-model','api-key-form');
   await open('tab=whatsnew');
   const select=page.locator('[data-k="alec-news-version"]');
   assert.equal(await select.locator('option').count(),versions.length);
   assert.equal(await select.inputValue(),version);
   await measure('#pane-whatsnew','current-release');
   await page.screenshot({path:path.join(dest,'news-'+width+'.png')});
   for(const v of versions.filter(v=>v!==version)){
    await select.selectOption(v);assert.ok(await page.locator('.alec-news-item').count()>0);
    await measure('#pane-whatsnew','release-'+v);
   }
   assert.deepEqual(errors,[],'JavaScript errors');
  }catch(e){await page.screenshot({path:path.join(dest,'failure-'+width+'.png')}).catch(()=>{});failures.push({viewport:[width,height],scenario,message:e.message,errors:[...errors]});console.error(width+'x'+height+' '+scenario+': '+e.message);}
  finally{await context.close();}
 }
}finally{
 await fs.mkdir(dest,{recursive:true});
 await fs.writeFile(path.join(dest,'layout-report.json'),JSON.stringify({results,failures},null,2));
 await browser?.close();await new Promise(ok=>server.close(ok));
}
if(failures.length)throw Error('Visual validation failed: '+JSON.stringify(failures));
console.log('ALEC layout verified: '+results.length+' scenarios; screenshots in '+dest);
