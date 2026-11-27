import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSession} from './transport.mjs';
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
