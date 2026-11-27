import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSession,createResilientLiveSession} from './transport.mjs';
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
