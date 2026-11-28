// Real native implementation integration. No external API, personal files or user secrets.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
const root=path.resolve(process.argv[2],'showcase/tauri/sidecar');
const {createTools}=await import(pathToFileURL(path.join(root,'tools.mjs')).href);
const {createLiveCore,createUnifiedLiveActions}=await import(pathToFileURL(path.join(root,'alec-live-transport.mjs')).href);
const dir=await fs.mkdtemp(path.join(os.homedir(),'alec-live-fixture-'));
let allow=true,skip=true,asks=0,duplicate=0;const events=[];
const signal=new AbortController().signal;
try{
 const {tools}=createTools({allowActions:()=>allow,skipAllow:()=>allow&&skip,workdir:dir,userName:'test',ui:()=>{},ask:async()=>{asks++;return 'Allow';},openUrl:()=>{},onCommitments:()=>{},showList:()=>{},fmtWhen:()=>'',commitmentsText:()=>''});
 const core=createLiveCore({registry:()=>tools,nativePolicy:true,actionsAllowed:()=>allow,skipAllow:()=>allow&&skip,confirm:async()=>{duplicate++;return false;},invoke:async(t,args,ctx)=>{events.push(['start',t.name]);try{return await t.execute(args,ctx);}finally{events.push(['end',t.name]);}}});
 const execute=(name,args)=>core.execute(name,args,signal,'fixture-'+events.length);
 const file=path.join(dir,'project.txt');
 await fs.writeFile(file,'original');
 const normal=tools.find(t=>t.name==='list_files');
 const listed=await normal.execute({dir},{signal,toolCallId:'normal'});
 assert.equal((await execute('list_files',{dir})).output,listed);
 assert.equal((await execute('read_file',{path:file})).output,'original');
 assert.equal((await execute('write_file',{path:file,content:'modified'})).fileVerified,true);
 assert.equal(await fs.readFile(file,'utf8'),'modified');
 assert.match((await execute('run_command',{command:'echo ALEC_LIVE_REAL_EXECUTION'})).output,/ALEC_LIVE_REAL_EXECUTION/);
 assert.equal(asks,0);assert.equal(duplicate,0);
 // Native protected paths stay protected even when automatic confirmation is enabled.
 await assert.rejects(execute('read_file',{path:path.join(dir,'.env')}),/Blocked for safety/);
 allow=false;await assert.rejects(execute('write_file',{path:file,content:'blocked'}));assert.equal(await fs.readFile(file,'utf8'),'modified');
 allow=true;skip=false;await execute('write_file',{path:file,content:'reviewed'});assert.equal(asks,1);assert.equal(duplicate,0);
 assert.equal(events.filter(e=>e[0]==='start').length,events.filter(e=>e[0]==='end').length);
 console.log('Legacy low-level native tools regression: read, list, write/readback, command and permissions verified.');
 // Test the real prepared channel-to-prompt adapter, with the model loop represented by a deterministic
 // fixture using the same actual native tool objects. No claim of a live Gemini/provider integration test.
 const side=await fs.readFile(path.join(root,'sidekick.mjs'),'utf8');
 const from=side.indexOf('async function alecRunUnifiedGoal(goal,signal){');
 const to=side.indexOf('function alecLiveChanged(items)',from);
 assert.ok(from>=0&&to>from);
 const queued=[];let promptCalls=0;
 const context=vm.createContext({alecLiveLocked:true,alecUnifiedTask:null,busy:false,queued:0,alecLiveCoreInFlight:0,saidCap:null,saidPending:false,alecUnifiedTranscript:[],clearTimeout,holdWake:()=>{},menu:()=>{},alecLiveRecord:()=>{},redact:x=>x});
 vm.runInContext(side.slice(from,to),context);
 context.prompt=async(goal,_image,_note,_byVoice,_news,_listenAfter)=>{
  promptCalls++;assert.equal(goal,'find and read the project file');
  const ctx=context.alecUnifiedTask;assert.ok(ctx);
  try{await normal.execute({dir:path.join(dir,'missing-folder')},{signal:ctx.signal,toolCallId:'first'});}catch{}
  ctx.receipts.push({tool:'list_files',error:true});
  const actual=await tools.find(t=>t.name==='read_file').execute({path:file},{signal:ctx.signal,toolCallId:'second'});
  ctx.receipts.push({tool:'read_file',error:false});
  context.alecUnifiedOutput({kind:'say',text:actual});
 };
 const shared=createUnifiedLiveActions({runGoal:context.alecRunUnifiedGoal,authorize:()=>true,schedule:f=>queued.push(f)});
 const req=shared.call({id:'shared-goal',name:'alec_execute_goal',args:{goal:'find and read the project file'}});
 queued.shift()();let answer;
 for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,10));answer=shared.call({id:'status'+i,name:'alec_task_status',args:{task_id:req.task_id}});if(answer.state!=='running')break;}
 assert.equal(answer.state,'complete');assert.equal(answer.result.reply,'reviewed');assert.equal(answer.result.tools.length,2);assert.equal(promptCalls,1);assert.equal(context.alecLiveCoreInFlight,0);
 shared.close();console.log('Prepared production goal adapter: one shared prompt invocation, alternative native operation fixture, result and lock release verified.');
}finally{await fs.rm(dir,{recursive:true,force:true});}
