// Browser adapter. A locally installed Playwright Chromium is injected by the trusted launcher.
import {normalizePlan} from './alec-agent-plans.mjs';
export async function createBrowserAdapter({browser,scope}){
 const canonical=normalizePlan({kind:'browser',scope,steps:[{action:'navigate',target:scope}]}).scope;
 // No inherited profile, cookies, downloads, permissions or service workers.
 const context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block',permissions:[],javaScriptEnabled:false});
 let page,active=false,mutations=false,closed=false,handles=new Map();
 const allowed=value=>{try{const u=new URL(value);return u.origin===canonical&&!u.username&&!u.password;}catch{return false;}};
 await context.route('**/*',async route=>{
  const r=route.request();
  if(!active||!allowed(r.url())||(!mutations&&!['GET','HEAD'].includes(r.method())))return route.abort();
  // route.continue may follow redirects without another route callback.
  // Fetch exactly one response and reject all redirects, including same-origin.
  let response;
  try{
   response=await route.fetch({maxRedirects:0,timeout:12000});
   if(response.status()>=300&&response.status()<400)return await route.abort();
   if(!allowed(response.url()))return await route.abort();
   const headers={...response.headers()};
   // Prevent nested active documents, speculative requests and meta redirects.
   headers['content-security-policy']="default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-src 'none'; object-src 'none'";
   delete headers.refresh;delete headers.link;
   await route.fulfill({response,headers});
  }catch{await route.abort().catch(()=>{});}
  finally{await response?.dispose().catch(()=>{});}
 });
 if(typeof context.routeWebSocket!=='function'){await context.close();throw Error('Playwright with WebSocket routing required');}
 await context.routeWebSocket('**/*',ws=>ws.close());
 page=await context.newPage();
 page.setDefaultTimeout(10000);
 page.on('popup',p=>void p.close().catch(()=>{}));
 page.on('download',d=>void d.cancel().catch(()=>{}));
 const verify=()=>{if(closed||!allowed(page.url()))throw Error('Browser left approved origin');};
 async function snapshot(){
  verify();for(const h of handles.values())await h.dispose().catch(()=>{});handles.clear();
  const loc=page.locator('a[href],button,input:not([type=password]):not([type=hidden]):not([type=file]),textarea,select');
  const count=Math.min(await loc.count(),100),elements=[];
  for(let i=0;i<count;i++){
   const h=await loc.nth(i).elementHandle();
   if(!h||!await h.isVisible())continue;
   const info=await h.evaluate(e=>({tag:e.tagName.toLowerCase(),type:e.getAttribute('type')||'',label:(e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||'').trim().slice(0,160),href:e.tagName==='A'?e.href:null}));
   if(info.href&&!allowed(info.href))continue;
   if(['password','hidden','file'].includes(info.type.toLowerCase()))continue;
   const id='e'+i;handles.set(id,h);elements.push({id,...info});
  }
  const text=(await page.locator('body').innerText()).slice(0,20000);
  verify();return {url:page.url(),title:await page.title(),text,elements};
 }
 async function execute({kind,scope:requested,step,signal},payload={}){
  if(closed||active||kind!=='browser'||requested!==canonical||signal?.aborted)throw Error('Invalid browser request');
  const {action,target}=normalizePlan({kind,scope:requested,steps:[step]}).steps[0];
  active=true;
  const abort=()=>{closed=true;void context.close().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  try{
   if(action==='navigate'){for(const h of handles.values())await h.dispose().catch(()=>{});handles.clear();await page.goto(target,{waitUntil:'domcontentloaded',timeout:15000});return snapshot();}
   verify();
   if(action==='read')return snapshot();
   const h=handles.get(target);
   if(!h||!await h.evaluate(e=>e.isConnected))throw Error('Stale element ID; read the page again');
   const info=await h.evaluate(e=>({tag:e.tagName,type:(e.getAttribute('type')||'').toLowerCase(),href:e.tagName==='A'?e.href:null,form:e.form?.action||null}));
   if(info.href&&!allowed(info.href)||info.form&&!allowed(info.form))throw Error('Outside approved origin');
   if(action==='fill'){
    if(!['INPUT','TEXTAREA'].includes(info.tag)||['password','hidden','file','submit','button','checkbox','radio'].includes(info.type)||typeof payload.value!=='string'||payload.value.length>2000)throw Error('Unsupported field');
    await h.fill(payload.value,{timeout:10000});
   }else if(action==='click'||action==='submit'){
    const submit=info.type==='submit'||info.tag==='BUTTON'&&info.type!=='button'&&!!info.form;
    if(action==='submit'&&!submit||action==='click'&&submit)throw Error('Submission requires its own reviewed step');
    mutations=action==='submit';await h.click({timeout:10000});
   }else throw Error('Unsupported browser operation');
   return snapshot();
  }finally{mutations=false;active=false;signal?.removeEventListener('abort',abort);}
 }
 return Object.freeze({execute,close:async()=>{closed=true;await context.close();}});
}
