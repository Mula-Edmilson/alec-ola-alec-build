// ALEC 0.3.4 foundation: reviewed, single-task agent plans; no network or shell access here.
import {randomUUID} from 'node:crypto';
const actions=Object.freeze({browser:['navigate','read','click','fill','submit'],developer:['list','read','proposePatch','applyPatch','runTest']});
const text=(v,n=1024)=>typeof v==='string'&&v.length>0&&v.length<=n&&!/[\x00-\x1f\x7f]/.test(v);
function origin(v){
 if(!text(v,2048))throw Error('Invalid browser scope');
 const u=new URL(v);
 if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Exact HTTPS origin required');
 return u.origin;
}
function relative(v){
 if(!text(v)||v.includes('\\')||v.includes(':')||v.includes('%')||v.split('/').some(s=>!s||s==='.'||s==='..'||/[. ]$/.test(s)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)))throw Error('Unsafe relative path');
 if(v.split('/').some(s=>/^(\.git|\.env(?:\..*)?|\.ssh|\.npmrc)$/i.test(s)))throw Error('Protected path');
 return v;
}
export function normalizePlan(input){
 if(!input||!Object.hasOwn(actions,input.kind)||!text(input.scope)||!Array.isArray(input.steps)||input.steps.length<1||input.steps.length>20)throw Error('Invalid plan');
 const kind=input.kind,scope=kind==='browser'?origin(input.scope):input.scope;
 // Developer scope is an opaque ID from a trusted workspace registry, not a user-supplied absolute path.
 if(kind==='developer'&&!/^[a-zA-Z0-9_-]{1,80}$/.test(scope))throw Error('Invalid workspace ID');
 const steps=input.steps.map(s=>{
  if(!s||!actions[kind].includes(s.action)||!text(s.target,2048))throw Error('Invalid action');
  let target=s.target;
  if(kind==='browser'){
   if(s.action==='navigate'){const u=new URL(target);if(u.origin!==scope||u.username||u.password)throw Error('Outside browser origin');target=u.href;}
   else if(!/^[a-zA-Z0-9_-]{1,80}$/.test(target))throw Error('Use an opaque element ID');
  }else if(s.action==='runTest'){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(target))throw Error('Use a registered test ID');}
  else target=relative(target);
  // No arbitrary command, JS evaluation, credentials, raw patch, or form data in the plan.
  const sensitive=['click','fill','submit','applyPatch','runTest'].includes(s.action);
  return Object.freeze({action:s.action,target,requiresApproval:sensitive});
 });
 return Object.freeze({kind,scope,steps:Object.freeze(steps)});
}
export function createAgentCoordinator({authorize,execute,clock=Date.now}={}){
 if(typeof authorize!=='function'||typeof execute!=='function')throw Error('Trusted adapters required');
 let task=null,busy=false;
 const view=()=>task&&Object.freeze({id:task.id,plan:task.plan,index:task.index,state:task.state});
 function prepare(input){
  if(busy||task&&['review','running'].includes(task.state))throw Error('Only one active agent task');
  task={id:randomUUID(),plan:normalizePlan(input),index:0,state:'review',approval:null,controller:new AbortController()};
  return view();
 }
 function approveStep(id,index,context){
  // context must be supplied by the authenticated local UI, never by an LLM or page.
  if(!task||task.id!==id||task.index!==index||task.state!=='review'||busy||context?.kind!=='desktop'||context?.verified!==true||context?.approvedBy!=='local-user')throw Error('Local approval required');
  task.approval={index,expires:clock()+60000};return view();
 }
 async function next(id){
  if(!task||task.id!==id||task.state!=='review'||busy)throw Error('No available step');
  const t=task,step=t.plan.steps[t.index];
  if(step.requiresApproval&&(!t.approval||t.approval.index!==t.index||t.approval.expires<=clock()))throw Error('Step approval required');
  t.approval=null;busy=true;t.state='running';
  try{
   const request=Object.freeze({kind:t.plan.kind,scope:t.plan.scope,step,signal:t.controller.signal});
   if(await authorize(request)!==true)throw Error('Scope authorization denied');
   if(t.controller.signal.aborted)throw Error('Cancelled');
   // Adapter MUST re-check origin after redirects and before every action, or canonical workspace
   // containment (including junctions/symlinks) before IO. No raw shell or arbitrary test commands.
   await execute(request);
   if(t.controller.signal.aborted){t.state='cancelled';return view();}
   t.index++;t.state=t.index===t.plan.steps.length?'complete':'review';
  }catch(e){t.state=t.controller.signal.aborted?'cancelled':'failed';throw e;}
  finally{busy=false;}
  return view();
 }
 function cancel(id){if(!task||task.id!==id||!['review','running'].includes(task.state))return false;task.controller.abort();task.approval=null;task.state='cancelled';return true;}
 return Object.freeze({prepare,approveStep,next,cancel,snapshot:view});
}
