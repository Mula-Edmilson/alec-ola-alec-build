// Local supervised agent runner. No API key, no automatic AI or plugin installation.
import fs from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {normalizePlan,createAgentCoordinator} from './alec-agent-plans.mjs';
import {createDeveloperAdapter} from './alec-developer-adapter.mjs';
import {createBrowserAdapter} from './alec-browser-adapter.mjs';
const [planFile]=process.argv.slice(2);
if(!planFile||!stdin.isTTY){console.error('Usage in an interactive local terminal: node executar-agentes.mjs plan.json');process.exit(1);}
const stat=await fs.stat(planFile);
if(stat.size>65536)throw Error('Plan too large');
const raw=JSON.parse(await fs.readFile(planFile,'utf8'));
const plan=normalizePlan(raw);
const rl=createInterface({input:stdin,output:stdout,terminal:true});
let browser,adapter,coordinator,last,payload={};
const clean=value=>JSON.stringify(value,null,2); // escaped control characters; never execute output
const yes=async question=>(await rl.question(question+' [SIM para confirmar] '))==='SIM';
try{
 console.log(clean(plan));
 if(!await yes('Autorizar esta tarefa e âmbito local?'))throw Error('Cancelled');
 if(plan.kind==='developer'){
  const root=await rl.question('Pasta absoluta do projecto: ');
  const tests={};
  for(const s of plan.steps.filter(s=>s.action==='runTest'))if(!Object.hasOwn(tests,s.target))Object.defineProperty(tests,s.target,{value:await rl.question('Ficheiro de teste Node relativo para '+s.target+': '),enumerable:true});
  adapter=await createDeveloperAdapter({root,scope:plan.scope,tests});
 }else{
  const {chromium}=await import('playwright');
  browser=await chromium.launch({channel:'msedge',headless:false,chromiumSandbox:true});
  adapter=await createBrowserAdapter({browser,scope:plan.scope});
 }
 const proposals=new Map();
 coordinator=createAgentCoordinator({authorize:({kind,scope})=>kind===plan.kind&&scope===plan.scope,execute:async request=>{last=await adapter.execute(request,payload);}});
 const task=coordinator.prepare(plan);
 const stop=()=>coordinator.cancel(task.id);process.once('SIGINT',stop);
 try{
  for(let i=0;i<plan.steps.length;i++){
   const step=plan.steps[i];payload={};
   console.log(clean(step));
   if(step.action==='proposePatch')payload.replacement=JSON.parse(await rl.question('Novo conteúdo completo (string JSON, sem segredos): '));
   if(step.action==='applyPatch'){const p=proposals.get(step.target);if(!p)throw Error('No proposal in this task');console.log(clean(p));payload.proposalId=p.id;}
   if(step.action==='fill')payload.value=await rl.question('Valor não confidencial (visível): ');
   if(!await yes('Executar este passo?')){stop();break;}
   if(step.requiresApproval)coordinator.approveStep(task.id,i,{kind:'desktop',verified:true,approvedBy:'local-user'});
   await coordinator.next(task.id);
   if(step.action==='proposePatch')proposals.set(step.target,last);
   console.log(clean(last));
   if(step.action==='runTest'&&last.code!==0){stop();console.error('Teste não aprovado');break;}
  }
  console.log(clean(coordinator.snapshot()));
 }finally{process.removeListener('SIGINT',stop);}
}catch(e){console.error('ALEC:',String(e.message).slice(0,300));process.exitCode=1;}
finally{rl.close();await adapter?.close?.();await browser?.close();}
