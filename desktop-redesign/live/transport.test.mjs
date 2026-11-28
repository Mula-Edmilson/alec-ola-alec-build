import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSession,createResilientLiveSession,createLiveActions,createLiveCore,liveInstruction,createUnifiedLiveActions} from './transport.mjs';
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

test('Live transcripts preserve completed dialogue and discard interrupted replies and internal events',async()=>{
 const {createLiveTranscript}=await import('./transport.mjs');const rows=[];const tr=createLiveTranscript({commit:x=>rows.push(...x)});
 tr.event({type:'input',text:'Olá'});tr.event({type:'input',text:' Alec'});tr.event({type:'output',text:'Olá!'});tr.event({type:'turn_complete'});
 assert.deepEqual(rows,[{role:'user',content:'Olá Alec'},{role:'assistant',content:[{type:'text',text:'Olá!'}]}]);
 tr.typed('Abre a calculadora');tr.event({type:'output',text:'Ainda'});tr.event({type:'interrupt'});assert.equal(rows.at(-1).content,'Abre a calculadora');
 tr.event({type:'output',text:'Evento interno'});tr.event({type:'turn_complete'});assert.equal(rows.length,3);
 tr.typed('Pedido enviado');tr.event({type:'reconnecting'});tr.finish();assert.equal(rows.length,4);assert.equal(rows.at(-1).content,'Pedido enviado');
});
test('History context requires explicit opt-in and excludes tool results and images',async()=>{
 const {liveHistoryContext}=await import('./transport.mjs');const messages=[{role:'user',content:[{type:'text',text:'Projeto X'},{type:'image',data:'PRIVATE'}]},{role:'tool',content:'SECRET'},{role:'assistant',content:[{type:'text',text:'Vamos continuar'}]}];
 assert.equal(liveHistoryContext(messages,false),'');
 const ctx=liveHistoryContext(messages,true,x=>x);assert.match(ctx,/Projeto X/);assert.match(ctx,/Vamos continuar/);assert.doesNotMatch(ctx,/SECRET|PRIVATE/);
 const ws=new Fake();const s=createLiveSession({apiKey:'x',model:'gemini-live',historyContext:ctx,socket:()=>ws});try{ws.dispatchEvent(new Event('open'));assert.match(ws.sent[0].setup.systemInstruction.parts[0].text,/Projeto X/);}finally{s.close();}
});

test('Live sends only a bounded JPEG on the existing socket and fails closed for unavailable frames',async()=>{
 const ws=new Fake(),s=createLiveSession({apiKey:'x',model:'gemini-live',socket:()=>ws});
 const jpg=Buffer.from([255,216,1,2,255,217]);
 try{assert.equal(s.video(jpg),false);ws.message({setupComplete:{}});await tick();
 assert.equal(s.video(Buffer.from('PNG')),false);assert.equal(s.video(Buffer.alloc(600000)),false);assert.equal(s.video(jpg),true);
 assert.deepEqual(ws.sent.at(-1).realtimeInput.video,{mimeType:'image/jpeg',data:jpg.toString('base64')});assert.equal(s.audio(Buffer.alloc(2560)),true);
 }finally{s.close();}
});
test('Screen vision invokes the approved native screenshot object and transfers no binary in the tool receipt',async()=>{
 const jpg=Buffer.from([255,216,1,2,255,217]),sent=[];let approve=false,accept=true,called=0;
 const tool={name:'take_screenshot',parameters:{safeParse:a=>({success:true,data:a})},execute:async()=>{called++;return {content:[{type:'text',text:'Native capture'},{type:'image',mediaType:'image/jpeg',data:jpg.toString('base64')}]}}};
 const core=createLiveCore({registry:()=>[tool],confirm:async()=>approve,sendImage:bytes=>{sent.push(bytes);return accept;}});
 const signal=new AbortController().signal;
 await assert.rejects(core.execute('take_screenshot',{target:'front'},signal,'1'),/not_approved/);assert.equal(called,0);
 approve=true;const receipt=await core.execute('take_screenshot',{target:'front'},signal,'2');assert.equal(receipt.imageSent,true);assert.deepEqual(sent[0],jpg);assert.doesNotMatch(JSON.stringify(receipt),new RegExp(jpg.toString('base64')));
 accept=false;await assert.rejects(core.execute('take_screenshot',{target:'front'},signal,'3'),/image_not_sent/);
});

test('Webcam is a private native tool and returns an image only after approval',async()=>{
 let captured=0,approved=false;const tool={name:'alec_webcam_capture',parameters:{safeParse:a=>({success:true,data:a})},execute:async()=>{captured++;return {content:[{type:'image',mediaType:'image/jpeg',data:'/9gBAv/Z'}]}}};
 const core=createLiveCore({registry:()=>[tool],confirm:async()=>approved,sendImage:()=>true});const sig=new AbortController().signal;
 await assert.rejects(core.execute('alec_webcam_capture',{},sig,'1'),/not_approved/);assert.equal(captured,0);
 approved=true;assert.equal((await core.execute('alec_webcam_capture',{},sig,'2')).imageSent,true);assert.equal(captured,1);
});

test('Universal plan preflights all steps, requires local review, and verifies mutations before continuing',async()=>{
 const {normalizeUniversalPlan,executeUniversalPlan}=await import('./transport.mjs');
 const plan=normalizeUniversalPlan({goal:'Report',steps:[{operation:'system_status'},{operation:'core_tool',tool:'write_file',args:{path:'report.txt',content:'ok'}},{operation:'open_app',app:'notepad'}]});
 const calls=[],progress=[],signal=new AbortController().signal;
 const opts={signal,authorize:()=>true,validateStep:()=>true,reviewPlan:async()=>true,progress:p=>progress.push(p),execute:async s=>{calls.push(s.operation);return s.tool==='write_file'?{status:'file_verified',fileVerified:true}:s.operation==='open_app'?{status:'window_verified',windowVerified:true}:{cpu:20};}};
 assert.equal((await executeUniversalPlan(plan,{...opts,reviewPlan:async()=>false})).status,'denied');assert.equal(calls.length,0);
 assert.equal((await executeUniversalPlan(plan,{...opts,validateStep:s=>s.operation!=='open_app'})).status,'denied');assert.equal(calls.length,0);
 const result=await executeUniversalPlan(plan,opts);assert.equal(result.status,'complete');assert.equal(result.completed,3);assert.deepEqual(result.receipts.map(r=>r.state),['read_returned','verified','verified']);assert.equal(progress.length,6);
 calls.length=0;const unknown=await executeUniversalPlan(plan,{...opts,execute:async s=>{calls.push(s.operation);return {output:'success'};}});assert.equal(unknown.status,'needs_review');assert.equal(unknown.replanAllowed,false);assert.equal(calls.length,2);
 assert.throws(()=>normalizeUniversalPlan({goal:'unsafe',steps:[{operation:'core_tool',tool:'run_command',args:{command:'anything'}}]}),/invalid_plan_step/);
 assert.throws(()=>normalizeUniversalPlan({goal:'duplicate',steps:[plan.steps[1],plan.steps[1]]}),/duplicate_plan_mutation/);
});
test('Universal plan uses existing serial queue, progress, retry and bounded replan receipts',async()=>{
 const signal=new AbortController();let calls=0;
 const a=createLiveActions({authorize:()=>true,validateStep:()=>true,reviewPlan:async()=>true,execute:async s=>{calls++;if(s.operation==='system_status')throw Error('EAGAIN');return {items:[]};}});
 let id=0;const start=p=>a.call({id:String(++id),name:'alec_start_task',args:{operation:'plan',plan_json:JSON.stringify(p)}});
 const status=t=>a.call({id:String(++id),name:'alec_task_status',args:{task_id:t.task_id}});
 try{const p={goal:'Find files',steps:[{operation:'system_status'}]};const first=start(p);assert.equal(first.state,'queued');await tick();await tick();assert.equal(calls,2);const fail=status(first);assert.equal(fail.state,'failed');assert.equal(fail.result.replanAllowed,true);assert.equal(fail.result.receipts[0].attempts,2);
 const second=start({goal:p.goal,parent_task_id:first.task_id,steps:[{operation:'sigma_search',query:'file'}]});assert.equal(second.state,'queued');await tick();await tick();assert.equal(status(second).state,'complete');
 assert.equal(start({goal:p.goal,parent_task_id:first.task_id,steps:[{operation:'sigma_search',query:'other'}]}).error,'replan_not_allowed');
 }finally{a.close();signal.abort();}
});
test('Cancellation waits for an in-flight mutation and never claims rollback',async()=>{
 let finish;const a=createLiveActions({authorize:()=>true,validateStep:()=>true,reviewPlan:async()=>true,execute:()=>new Promise(r=>{finish=r;})});
 try{const task=a.call({id:'p',name:'alec_start_task',args:{operation:'plan',plan_json:JSON.stringify({goal:'Write',steps:[{operation:'core_tool',tool:'write_file',args:{path:'report.txt',content:'data'}}]})}});await tick();
 const c=a.call({id:'c',name:'alec_cancel_task',args:{task_id:task.task_id}});assert.equal(c.state,'cancel_requested');finish({status:'file_verified',fileVerified:true});await tick();
 const status=a.call({id:'s',name:'alec_task_status',args:{task_id:task.task_id}});assert.equal(status.state,'cancelled');assert.equal(status.result.receipts[0].state,'effect_unknown');assert.equal(status.result.replanAllowed,false);
 }finally{a.close();}
});
test('Independent write proof uses real native readback, not a success string',async()=>{
 let contents='',matches=true;const params={safeParse:data=>({success:true,data})};
 const core=createLiveCore({registry:()=>[{name:'write_file',parameters:params,execute:async a=>{contents=a.content;return 'Success';}},{name:'read_file',parameters:params,execute:async()=>matches?contents:'different'}],actionsAllowed:()=>true,confirm:async()=>true});
 const s=new AbortController().signal;
 assert.equal((await core.execute('write_file',{path:'report.txt',content:'data'},s,'w')).fileVerified,true);matches=false;assert.equal((await core.execute('write_file',{path:'report.txt',content:'data'},s,'x')).fileVerified,false);
});

test('Closing Live retains the plan activity guard until the actual native operation settles',async()=>{
 let finish;const activity=[];const a=createLiveActions({authorize:()=>true,validateStep:()=>true,reviewPlan:async()=>true,planActivity:v=>activity.push(v),execute:()=>new Promise(r=>{finish=r;})});
 a.call({id:'p',name:'alec_start_task',args:{operation:'plan',plan_json:JSON.stringify({goal:'Write',steps:[{operation:'core_tool',tool:'write_file',args:{path:'report.txt',content:'data'}}]})}});
 await tick();assert.deepEqual(activity,[true]);a.close();assert.deepEqual(activity,[true]);finish({status:'file_verified',fileVerified:true});await tick();assert.deepEqual(activity,[true,false]);
});

test('Desktop Live cannot start with a missing executor and advertises tools on the same session',()=>{
 const socket=new Fake();
 assert.throws(()=>createResilientLiveSession({apiKey:'x',model:'gemini-live',requireActions:true,socket:()=>socket}),/desktop_live_executor_required/);
 const actions=createLiveActions({authorize:()=>true,execute:async()=>({ok:true})});
 const s=createResilientLiveSession({apiKey:'x',model:'gemini-live',requireActions:true,actions,socket:()=>socket});
 try{socket.dispatchEvent(new Event('open'));const setup=socket.sent[0].setup;
 assert.ok(setup.tools[0].functionDeclarations.some(d=>d.name==='alec_start_task'));
 assert.ok(setup.tools[0].functionDeclarations.some(d=>d.name==='alec_core_memory'));
 assert.doesNotMatch(setup.systemInstruction.parts[0].text,/Neste modo apenas conversas/);
 }finally{s.close();actions.close();}
});

test('Unified Live delegates every ordinary tool to its native policy without a duplicate confirmation',async()=>{
 let allow=true,skip=true,prompts=0,wrapperPrompts=0;const invocations=[];
 const params={safeParse:data=>({success:true,data})};
 const registry=[{name:'list_files',parameters:params,execute:async()=>['project']},{name:'run_command',parameters:params,execute:async()=>{if(!allow)throw Error('actions_off');if(!skip)prompts++;return 'command returned';}},{name:'connection_tools',parameters:params,execute:async()=>({tools:[]})},{name:'alec_webcam_capture',parameters:params,execute:async()=>({content:[{type:'image',mediaType:'image/jpeg',data:'/9gBAv/Z'}]})}];
 const core=createLiveCore({registry:()=>registry,nativePolicy:true,actionsAllowed:()=>allow,skipAllow:()=>allow&&skip,confirm:async()=>{wrapperPrompts++;return true;},sendImage:()=>true,invoke:async(t,args,ctx)=>{invocations.push(t.name);return t.execute(args,ctx);}});
 const signal=new AbortController().signal;
 assert.deepEqual(core.catalog().tools.map(t=>t.name),registry.map(t=>t.name));
 await core.execute('list_files',{},signal,'1');await core.execute('run_command',{},signal,'2');await core.execute('connection_tools',{},signal,'3');await core.execute('alec_webcam_capture',{},signal,'4');
 assert.equal(wrapperPrompts,0);assert.equal(prompts,0);
 skip=false;await core.execute('run_command',{},signal,'5');assert.equal(prompts,1);assert.equal(wrapperPrompts,0);
 await core.execute('alec_webcam_capture',{},signal,'6');assert.equal(wrapperPrompts,1);
 allow=false;await assert.rejects(core.execute('run_command',{},signal,'7'),/actions_off/);assert.equal(wrapperPrompts,1);
 assert.equal(invocations.length,7);
});

test('Desktop Live delegates the whole user goal to the shared agent, not individual tools',async()=>{
 const goals=[],jobs=[],states=[];const actions=createUnifiedLiveActions({authorize:()=>true,runGoal:async(goal,signal)=>{goals.push(goal);return {status:'agent_finished',reply:'completed shared turn',tools:[{tool:'search_files',error:true},{tool:'list_files',error:false}]};},schedule:f=>jobs.push(f),changed:s=>states.push(s)});
 const ws=new Fake();const s=createResilientLiveSession({apiKey:'x',model:'gemini-live',requireActions:true,actions,socket:()=>ws});
 try{ws.dispatchEvent(new Event('open'));const setup=ws.sent[0].setup;assert.deepEqual(setup.tools[0].functionDeclarations.map(x=>x.name),['alec_execute_goal','alec_task_status','alec_cancel_task']);assert.doesNotMatch(setup.systemInstruction.parts[0].text,/Neste modo apenas conversas/);
 const c={id:'goal1',name:'alec_execute_goal',args:{goal:'Find the file using alternative methods'}},q=actions.call(c);assert.equal(q.state,'queued');assert.equal(actions.call(c).duplicate,true);assert.equal(actions.call({id:'old',name:'alec_start_task',args:{operation:'core_tool'}}).state,'rejected');jobs.shift()();await tick();assert.deepEqual(goals,[c.args.goal]);const r=actions.call({id:'check',name:'alec_task_status',args:{task_id:q.task_id}});assert.equal(r.state,'complete');assert.equal(r.result.tools.length,2);
 }finally{s.close();actions.close();}
});
test('Shared agent task cancellation waits for actual turn to stop',async()=>{
 let release,seen;const jobs=[];const a=createUnifiedLiveActions({authorize:()=>true,runGoal:async(goal,signal)=>{seen=signal;await new Promise(r=>release=r);return {status:'agent_finished'};},schedule:f=>jobs.push(f)});
 const q=a.call({id:'g',name:'alec_execute_goal',args:{goal:'read file'}});jobs.shift()();await tick();
 assert.equal(a.call({id:'c',name:'alec_cancel_task',args:{task_id:q.task_id}}).state,'cancel_requested');assert.equal(seen.aborted,true);release();await tick();assert.equal(a.call({id:'s',name:'alec_task_status',args:{task_id:q.task_id}}).state,'cancelled');a.close();
});
