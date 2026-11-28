import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSession,createResilientLiveSession,createLiveActions,createLiveCore,liveInstruction} from './transport.mjs';
class Fake extends EventTarget{readyState=1;bufferedAmount=0;sent=[];send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;}message(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}}
const tick=()=>new Promise(r=>setImmediate(r));
test('setup gates microphone, sends PCM16, streams audio and flush signal, then closes',async()=>{
 const ws=new Fake(),events=[];const session=createLiveSession({apiKey:'test',model:'gemini-3.1-flash-live-preview',socket:()=>ws,emit:e=>events.push(e)});
 assert.equal(session.audio(Buffer.alloc(2560)),false);ws.dispatchEvent(new Event('open'));assert.equal(ws.sent[0].setup.generationConfig.responseModalities[0],'AUDIO');assert.equal(ws.sent[0].setup.tools,undefined);
 ws.message({setupComplete:{}});await tick();assert.equal(session.state,'ready');assert.ok(session.audio(Buffer.alloc(2560)));assert.equal(ws.sent[1].realtimeInput.audio.mimeType,'audio/pcm;rate=16000');
 ws.message({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:'AAAAAA=='}}]}}});ws.message({serverContent:{interrupted:true}});await tick();assert.deepEqual(events.map(e=>e.type),['ready','audio','interrupt']);
 session.close();assert.equal(session.audio(Buffer.alloc(2560)),false);assert.equal(events.at(-1).type,'closed');
});
test('backpressure and unexpected tool calls fail closed',async()=>{
 for(const kind of ['pressure','tool']){const ws=new Fake();const s=createLiveSession({apiKey:'x',model:'gemini-live',socket:()=>ws});ws.message({setupComplete:{}});await tick();
 if(kind==='pressure'){ws.bufferedAmount=999999;assert.equal(s.audio(Buffer.alloc(2)),false);}else{ws.message({toolCall:{}});await tick();}
 assert.equal(s.state,'closed');}
});

test('native reconnect retains session handle, hides checkpoint, and supports explicit stop',async()=>{
 const sockets=[],events=[];const s=createResilientLiveSession({apiKey:'x',model:'gemini-live',retryDelay:1,socket:()=>{const f=new Fake();sockets.push(f);return f;},emit:e=>events.push(e)});
 try{
 const first=sockets[0];first.dispatchEvent(new Event('open'));assert.deepEqual(first.sent[0].setup.sessionResumption,{});assert.deepEqual(first.sent[0].setup.contextWindowCompression,{slidingWindow:{}});
 first.message({setupComplete:{}});first.message({sessionResumptionUpdate:{resumable:true,newHandle:'opaque'}});first.message({goAway:{timeLeft:'30s'}});first.message({serverContent:{turnComplete:true}});await tick();
 assert.equal(s.state,'connecting');assert.equal(s.audio(Buffer.alloc(2560)),false);assert.ok(events.some(e=>e.type==='reconnecting'));assert.ok(!events.some(e=>e.type==='closed'||e.handle));
 await new Promise(r=>setTimeout(r,20));assert.equal(sockets.length,2);const second=sockets[1];second.dispatchEvent(new Event('open'));assert.deepEqual(second.sent[0].setup.sessionResumption,{handle:'opaque'});
 second.message({setupComplete:{}});await tick();assert.equal(s.state,'ready');assert.ok(s.audio(Buffer.alloc(2560)));
 }finally{s.close();}
 assert.equal(s.state,'closed');assert.equal(events.at(-1).reason,'stopped');
});

test('initial transient failure recovers; repeated short-lived connections stop after three retries',async()=>{
 const sockets=[],events=[];const s=createResilientLiveSession({apiKey:'x',model:'gemini-live',retryDelay:1,stableMs:60000,socket:()=>{const f=new Fake();sockets.push(f);return f;},emit:e=>events.push(e)});
 const wait=()=>new Promise(r=>setTimeout(r,25));
 try{
  sockets[0].dispatchEvent(new Event('close'));await wait();assert.equal(sockets.length,2);
  for(let i=1;i<=3;i++){
   sockets[i].message({setupComplete:{}});await tick();assert.equal(s.state,'ready');
   sockets[i].dispatchEvent(new Event('close'));await wait();
  }
  assert.equal(sockets.length,4);assert.equal(s.state,'closed');assert.equal(events.at(-1).reason,'connection_closed');
  assert.equal(events.filter(e=>e.type==='reconnecting').length,3);
  assert.equal(events.filter(e=>e.type==='context_reset').length,2);
 }finally{s.close();}
});
test('idle goAway renews before disconnect; policy close is not retried even after generic error',async()=>{
 const sockets=[],events=[];const s=createResilientLiveSession({apiKey:'x',model:'gemini-live',retryDelay:1,socket:()=>{const f=new Fake();sockets.push(f);return f;},emit:e=>events.push(e)});
 try{
  sockets[0].message({setupComplete:{}});sockets[0].message({sessionResumptionUpdate:{resumable:true,newHandle:'keep'}});sockets[0].message({goAway:{timeLeft:'1s'}});await tick();await new Promise(r=>setTimeout(r,25));
  assert.equal(sockets.length,2);sockets[1].dispatchEvent(new Event('open'));assert.equal(sockets[1].sent[0].setup.sessionResumption.handle,'keep');
  sockets[1].message({setupComplete:{}});await tick();
  sockets[1].dispatchEvent(new Event('error'));const close=new Event('close');Object.defineProperty(close,'code',{value:1008});sockets[1].dispatchEvent(close);await tick();
  assert.equal(s.state,'closed');assert.equal(events.at(-1).reason,'policy_or_quota');assert.equal(sockets.length,2);
 }finally{s.close();}
});

test('Live tasks acknowledge immediately while work is pending; audio and reconnect remain independent',async()=>{
 const sockets=[],events=[],work=[];let complete;
 const actions=createLiveActions({authorize:()=>true,execute:async args=>{work.push(args);return new Promise(r=>{complete=r;});}});
 const s=createResilientLiveSession({apiKey:'x',model:'gemini-live',retryDelay:1,actions,socket:()=>{const f=new Fake();sockets.push(f);return f;},emit:e=>events.push(e)});
 try{
  const ws=sockets[0];ws.dispatchEvent(new Event('open'));assert.deepEqual(ws.sent[0].setup.tools[0].functionDeclarations.map(d=>d.name).sort(),['alec_start_task','alec_core_catalog','alec_core_skills','alec_core_memory','alec_task_status','alec_cancel_task'].sort());
  ws.message({setupComplete:{}});await tick();
  const fc={id:'task1',name:'alec_start_task',args:{operation:'system_status'}};
  ws.message({toolCall:{functionCalls:[fc]}});await tick();await tick();
  const ack=ws.sent.find(x=>x.toolResponse).toolResponse.functionResponses[0];assert.equal(ack.id,'task1');assert.equal(ack.response.state,'queued');
  assert.equal(work.length,1);assert.ok(s.audio(Buffer.alloc(2560)));
  ws.message({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:'AAAAAA=='}}]}}});await tick();assert.ok(events.some(e=>e.type==='audio'));
  ws.dispatchEvent(new Event('close'));await new Promise(r=>setTimeout(r,25));const second=sockets[1];second.message({setupComplete:{}});await tick();
  second.message({toolCall:{functionCalls:[fc]}});await tick();assert.equal(work.length,1);
  complete({ram:45});await tick();
  second.message({toolCall:{functionCalls:[{id:'status',name:'alec_task_status',args:{task_id:ack.response.task_id}}]}});await tick();
  assert.equal(second.sent.at(-1).toolResponse.functionResponses[0].response.result.ram,45);
 }finally{s.close();actions.close();}
});
test('Live task policy denies unknown or unapproved actions; cancellation and replay never launch twice',async()=>{
 let allowed=false,count=0;
 const actions=createLiveActions({authorize:()=>allowed,execute:async()=>{count++;return {status:'window_verified',windowVerified:true};}});
 const start=(id,args)=>actions.call({id,name:'alec_start_task',args});
 try{
  assert.equal(start('a',{operation:'open_app',app:'notepad'}).error,'not_authorized');
  allowed=true;
  assert.equal(start('b',{operation:'open_app',app:'powershell'}).error,'invalid_or_unavailable_tool');
  assert.equal(start('c',{operation:'open_app',app:'notepad',command:'x'}).error,'invalid_or_unavailable_tool');
  const t=start('d',{operation:'open_app',app:'notepad'});await tick();await tick();assert.equal(count,1);
  assert.equal(start('d',{operation:'open_app',app:'notepad'}).task_id,t.task_id);
  const retry=start('e',{operation:'open_app',app:'notepad'});assert.notEqual(retry.task_id,t.task_id);await tick();await tick();assert.equal(count,2);
  const read=start('f',{operation:'sigma_search',query:'photos'});actions.cancelCalls(['f']);await tick();assert.equal(count,2);
  assert.equal(actions.call({id:'status',name:'alec_task_status',args:{task_id:read.task_id}}).state,'cancelled');
  allowed=false;assert.equal(actions.call({id:'check',name:'alec_task_status',args:{task_id:t.task_id}}).error,'permission_revoked');
 }finally{actions.close();}
});

test('replayed Live calls return current state and never expose results after permission revocation',async()=>{
 let allowed=true,count=0;
 const actions=createLiveActions({authorize:()=>allowed,execute:async()=>{count++;return {ram:42};}});
 const start={id:'start-replay',name:'alec_start_task',args:{operation:'system_status'}};
 try{
  const initial=actions.call(start);assert.equal(initial.state,'queued');
  await tick();await tick();
  const replay=actions.call(start);assert.equal(replay.state,'complete');assert.equal(replay.duplicate,true);assert.equal(count,1);
  const status={id:'status-replay',name:'alec_task_status',args:{task_id:initial.task_id}};
  assert.equal(actions.call(status).result.ram,42);
  allowed=false;
  const denied=actions.call(status);assert.equal(denied.error,'permission_revoked');assert.equal(denied.result,undefined);
  assert.equal(actions.call(start).error,'permission_revoked');assert.equal(count,1);
 }finally{actions.close();}
});

test('Unified Live routes a typed Ask to the same socket and uses the configured personality',async()=>{
 const ws=new Fake();const session=createLiveSession({apiKey:'x',model:'gemini-live',persona:'ALEC PERSONALITY MARKER',socket:()=>ws});
 try{assert.equal(session.text('Olá'),false);ws.dispatchEvent(new Event('open'));
 assert.match(ws.sent[0].setup.systemInstruction.parts[0].text,/ALEC PERSONALITY MARKER/);
 assert.equal(ws.sent[0].setup.realtimeInputConfig.automaticActivityDetection.silenceDurationMs,1150);
 ws.message({setupComplete:{}});await tick();assert.equal(session.text('Abre o meu projecto'),true);
 assert.equal(ws.sent.at(-1).realtimeInput.text,'Abre o meu projecto');}finally{session.close();}
});
test('Unified core catalog and execution use the actual registered object, with schema, approval, and policy',async()=>{
 const invoked=[];let approved=false,allow=true,seen;
 const tool={name:'open',description:'Open any supported target',rawInputSchema:{type:'object'},parameters:{safeParse:a=>typeof a.target==='string'?{success:true,data:a}:{success:false}},execute:async(a,ctx)=>{invoked.push(a);assert.ok(ctx.signal);return 'Opened '+a.target;}};
 const core=createLiveCore({registry:()=>[tool,{...tool,name:'unregistered_admin'}],actionsAllowed:()=>allow,confirm:async x=>{seen=x;return approved;}});
 const signal=new AbortController().signal;
 assert.equal(core.catalog().tools[0].name,'open');assert.equal(core.catalog('unregistered_admin').error,'tool_unavailable');
 await assert.rejects(core.execute('open',{target:'Photoshop'},signal,'x'),/not_approved/);
 approved=true;const opening=await core.execute('open',{target:'Photoshop'},signal,'x');assert.equal(opening.status,'launch_requested');assert.equal(opening.windowVerified,false);assert.equal(invoked.length,1);assert.match(seen.args,/Photoshop/);
 allow=false;await assert.rejects(core.execute('open',{target:'Chrome'},signal,'y'),/native_actions_disabled/);assert.equal(invoked.length,1);
});
test('Live core tasks acknowledge immediately, retain typed args and query authorized memory',async()=>{
 let finish;const a=createLiveActions({authorize:()=>true,execute:async args=>{assert.equal(args.tool,'open');assert.equal(args.args.target,'Photoshop');return new Promise(r=>finish=r);},catalog:()=>({tools:[{name:'open'}]}),memory:()=>({available:true,context:'approved'} )});
 try{assert.equal(a.call({id:'list',name:'alec_core_catalog',args:{}}).tools[0].name,'open');assert.equal(a.call({id:'mem',name:'alec_core_memory',args:{query:'project'}}).context,'approved');
 const t=a.call({id:'task',name:'alec_start_task',args:{operation:'core_tool',tool:'open',args_json:'{"target":"Photoshop"}'}});assert.equal(t.state,'queued');await tick();finish({ok:true});await tick();
 assert.equal(a.call({id:'status',name:'alec_task_status',args:{task_id:t.task_id}}).state,'complete');}finally{a.close();}
});

test('Live denies discovery and memory when grant is revoked and allows explicitly repeated finished core requests',async()=>{
 let allowed=true,invoked=0;const seen=[];const a=createLiveActions({authorize:()=>allowed,execute:async()=>{invoked++;return {ok:true};},catalog:()=>({tools:['open']}),memory:()=>({available:true,context:'approved'}),onResultRead:id=>seen.push(id)});
 try{
 const args={operation:'core_tool',tool:'open',args_json:'{"target":"Photoshop"}'};
 const first=a.call({id:'first',name:'alec_start_task',args});await tick();await tick();
 const status=a.call({id:'check',name:'alec_task_status',args:{task_id:first.task_id}});assert.equal(status.state,'complete');assert.deepEqual(seen,[first.task_id]);
 const second=a.call({id:'second',name:'alec_start_task',args});assert.notEqual(first.task_id,second.task_id);await tick();await tick();assert.equal(invoked,2);
 allowed=false;assert.equal(a.call({id:'catalog',name:'alec_core_catalog',args:{}}).error,'not_authorized');assert.equal(a.call({id:'memory',name:'alec_core_memory',args:{query:'project'}}).error,'not_authorized');
 }finally{a.close();}
});

 test('unverified app launch fails closed, replay stays idempotent, and a new request may retry',async()=>{
 let count=0;const actions=createLiveActions({authorize:()=>true,execute:async()=>++count===1?{status:'launch_requested',windowVerified:false}:{status:'window_verified',windowVerified:true}});
 const start=id=>actions.call({id,name:'alec_start_task',args:{operation:'open_app',app:'calculator'}});
 const status=(id,task)=>actions.call({id,name:'alec_task_status',args:{task_id:task}});
 try{const a=start('launch1');await tick();await tick();const failed=status('proof1',a.task_id);assert.equal(failed.state,'failed');assert.equal(failed.error,'window_not_verified');assert.equal(start('launch1').task_id,a.task_id);assert.equal(count,1);const b=start('launch2');assert.notEqual(b.task_id,a.task_id);await tick();await tick();assert.equal(status('proof2',b.task_id).result.windowVerified,true);assert.equal(count,2);}finally{actions.close();}
});

 test('Live context discovers installed skills and shares configured facts only with explicit cloud permission',async()=>{
 const {createLiveContext}=await import('./transport.mjs');let cloud=false;const context=createLiveContext({cloudAllowed:()=>cloud,facts:()=>['Projecto Lirandzo','Preferência português'],skills:()=>[{slug:'sigma',name:'Sigma',description:'File search',path:'private-path'}],adaptive:()=> 'approved context'});
 const actions=createLiveActions({authorize:()=>true,execute:async()=>({}),memory:context.memory,skills:context.skillsList});
 try{const ask=(id,name,args)=>actions.call({id,name,args});assert.equal(ask('m1','alec_core_memory',{query:'Lirandzo'}).reason,'cloud_memory_disabled');cloud=true;assert.deepEqual(ask('m2','alec_core_memory',{query:'Lirandzo'}).configured_facts,['Projecto Lirandzo']);const inv=ask('s1','alec_core_skills',{});assert.equal(inv.skills[0].name,'Sigma');assert.equal(inv.skills[0].path,undefined);assert.equal(ask('s1','alec_core_skills',{}).error,'request_context_again');}finally{actions.close();}
});

 test('native structured failures are not successful tasks, and catalog replay respects revocation',async()=>{
 let permitted=true;const tool={name:'list_files',parameters:{safeParse:a=>({success:true,data:a})},execute:async()=>({isError:true,content:[{type:'text',text:'failed'}]})};const core=createLiveCore({registry:()=>[tool],confirm:async()=>true});const actions=createLiveActions({authorize:()=>permitted,execute:async(a,signal)=>core.execute(a.tool,a.args,signal,'id'),catalog:core.catalog});try{const catalog={id:'catalog1',name:'alec_core_catalog',args:{}};assert.equal(actions.call(catalog).tools[0].name,'list_files');const task=actions.call({id:'job',name:'alec_start_task',args:{operation:'core_tool',tool:'list_files',args_json:'{}'}});await tick();await tick();assert.equal(actions.call({id:'result',name:'alec_task_status',args:{task_id:task.task_id}}).error,'native_tool_failed');permitted=false;assert.equal(actions.call(catalog).error,'permission_revoked');assert.deepEqual(actions.call({id:'all',name:'alec_task_status',args:{}}).tasks,[]);}finally{actions.close();}
});
