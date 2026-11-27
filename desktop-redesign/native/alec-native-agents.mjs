// Native ALEC panel session. No model, remote, arbitrary command or auto-install hooks.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {normalizePlan,createAgentCoordinator} from './alec-agent-plans.mjs';
import {createDeveloperAdapter} from './alec-developer-adapter.mjs';
import {createBrowserAdapter} from './alec-browser-adapter.mjs';
const CAPS={browser:{navigate:'browser.read',read:'browser.read',click:'browser.interact',fill:'browser.interact',submit:'browser.submit'},developer:{list:'files.read',read:'files.read',proposePatch:'files.read',applyPatch:'files.write',runTest:'command.run'}};
const MAX_REVIEW=16000;
async function launchEdge(scope){
 if(process.platform!=='win32'||!process.env.LOCALAPPDATA)throw Error('Browser Agent requires Windows and Edge');
 const root=path.join(process.env.LOCALAPPDATA,'ALEC','agent-runtime','node_modules','playwright');
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 if(pkg.name!=='playwright'||pkg.version!=='1.65.1')throw Error('Install the approved Playwright 1.65.1 runtime first');
 const {chromium}=await import(pathToFileURL(path.join(root,'index.mjs')).href);
 const browser=await chromium.launch({channel:'msedge',headless:true,chromiumSandbox:true});
 try{const a=await createBrowserAdapter({browser,scope});return {execute:a.execute,close:async()=>{try{await a.close();}finally{await browser.close();}}};}
 catch(e){await browser.close();throw e;}
}
export function createNativeAgents({trust,origin,changed=()=>{},browserFactory=launchEdge,developerFactory=createDeveloperAdapter,clock=Date.now}={}){
 if(!trust||origin?.kind!=='desktop'||origin?.verified!==true)throw Error('Verified local origin required');
 let session=null,staged=null,result=null,error='',busy=false,grant=null,handling=false;
 const emit=()=>changed();
 const snapshot=()=>({busy,error,session:session?{id:session.id,kind:session.kind,scope:session.scope,root:session.root,expires:session.expires}:null,staged:staged?{id:staged.id,step:staged.step,review:staged.review}:null,result});
 function revoke(){if(grant){trust.revoke(grant.id);grant=null;}}
 async function close(){
  if(busy)throw Error('Cancel the active action first');
  const old=session;session=null;staged=null;result=null;error='';revoke();
  if(old){clearTimeout(old.timer);await old.adapter.close?.();}
 }
 async function open(m){
  if(busy)throw Error('Agent busy');
  await close();busy=true;emit();
  try{
   const id=randomUUID(),kind=m.kind;
   if(kind!=='browser'&&kind!=='developer')throw Error('Unknown agent');
   let scope,root,adapter;
   if(kind==='browser'){
    const u=new URL(m.url);
    scope=normalizePlan({kind,scope:u.origin,steps:[{action:'navigate',target:u.href}]}).scope;
    if(u.username||u.password)throw Error('Credentials in URLs are not permitted');
    adapter=await browserFactory(scope);
   }else{
    if(typeof m.root!=='string'||!path.isAbsolute(m.root)||m.root.length>1024)throw Error('Choose an absolute project folder');
    root=await fs.realpath(m.root);scope=id;
    const tests={};if(m.testFile){normalizePlan({kind,scope,steps:[{action:'read',target:m.testFile}]});tests.unit=m.testFile;}
    adapter=await developerFactory({root,scope,tests});
   }
   session={id,kind,scope,root,adapter,expires:clock()+900000,proposals:new Map(),coordinator:null};
   const current=session;
   session.coordinator=createAgentCoordinator({clock,authorize:({step})=>!!grant&&session===current&&clock()<current.expires&&trust.authorize({capability:CAPS[kind][step.action],origin,scope:grant.scope}).allowed,execute:async request=>{
    const value=await adapter.execute(request,staged.payload);
    if(request.signal.aborted)return;
    if(request.step.action==='proposePatch'){
     if(value.before.length>MAX_REVIEW||value.after.length>MAX_REVIEW)throw Error('File too large for complete panel review');
     current.proposals.set(request.step.target,value);
    }
    if(request.step.action==='applyPatch')current.proposals.delete(request.step.target);
    result=value;
   }});
   session.timer=setTimeout(()=>{if(session!==current)return;if(busy){const t=current.coordinator.snapshot();if(t)current.coordinator.cancel(t.id);}else void close().catch(()=>{}).finally(emit);},900000);session.timer.unref?.();
  }finally{busy=false;emit();}
 }
 function stage(m){
  if(busy||!session||session.id!==m.sessionId||clock()>=session.expires)throw Error('Open a fresh session');
  if(staged)throw Error('Confirm or discard the existing proposal first');
  const {kind,scope}=session;
  const step=normalizePlan({kind,scope,steps:[{action:m.action,target:m.target}]}).steps[0];
  let payload={},review=null;
  if(step.action==='fill'){if(typeof m.value!=='string'||m.value.length>2000)throw Error('Invalid form value');payload={value:m.value};review={value:m.value};}
  if(step.action==='proposePatch'){if(typeof m.value!=='string'||m.value.length>MAX_REVIEW)throw Error('Replacement too large');payload={replacement:m.value};review={replacement:m.value};}
  if(step.action==='applyPatch'){const p=session.proposals.get(step.target);if(!p)throw Error('Prepare and review a replacement first');payload={proposalId:p.id};review={before:p.before,after:p.after,sha256:p.sha256};}
  staged={id:randomUUID(),step,payload,review,expires:clock()+60000};error='';emit();
 }
 async function confirm(m){
  if(busy||!session||!staged||m.sessionId!==session.id||m.id!==staged.id||clock()>=staged.expires||clock()>=session.expires)throw Error('Proposal missing or expired; discard and prepare again');
  const current=session,entry=staged,c=current.coordinator;
  busy=true;result=null;emit();
  try{
   const task=c.prepare({kind:current.kind,scope:current.scope,steps:[entry.step]});
   grant=trust.grant({capability:CAPS[current.kind][entry.step.action],origin,scope:current.id+':'+entry.id,ttl:60000,approvedBy:'local-user'});
   if(entry.step.requiresApproval)c.approveStep(task.id,0,{...origin,approvedBy:'local-user'});
   await c.next(task.id);
  }finally{revoke();staged=null;busy=false;if(clock()>=current.expires)await close();emit();}
 }
 async function handle(m){
  if(handling&&m.type!=='alec_agents_cancel')return;
  const cancel=m.type==='alec_agents_cancel';if(!cancel)handling=true;
  error='';
  try{
   if(m.type==='alec_agents_open')await open(m);
   else if(m.type==='alec_agents_stage')stage(m);
   else if(m.type==='alec_agents_confirm')await confirm(m);
   else if(m.type==='alec_agents_discard'&&!busy){staged=null;result=null;}
   else if(m.type==='alec_agents_close'&&!busy)await close();
   else if(m.type==='alec_agents_cancel'&&busy&&session){const t=session.coordinator.snapshot();if(t)session.coordinator.cancel(t.id);}
  }catch(e){error=String(e.message||e).slice(0,350);}
  finally{if(!cancel)handling=false;emit();}
 }
 return Object.freeze({snapshot,handle,active:()=>busy||handling});
}
