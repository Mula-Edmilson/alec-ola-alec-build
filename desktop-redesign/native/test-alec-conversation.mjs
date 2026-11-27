import test from 'node:test';
import assert from 'node:assert/strict';
import {endpointProfile,createVoiceGate,createVoiceTrace,conversationSelfTest} from './alec-conversation.mjs';
test('unique final IDs; repeated words in a new take remain valid',()=>{
 const gate=createVoiceGate({limit:3});
 assert.equal(gate.accept('10:1000:1'),true);
 assert.equal(gate.accept('10:1000:1'),false);
 assert.equal(gate.accept('10:1000:2'),true);
 assert.equal(gate.accept('10:2000:1'),true);
 assert.equal(gate.accept('arbitrary text'),false);
 assert.equal(gate.accept(undefined),true);
 assert.equal(endpointProfile('patient'),'patient');assert.equal(endpointProfile('other'),'adaptive');
});
test('trace marks once, preserves async context, associates only correct audio',async()=>{
 let now=0;const rows=[];const t=createVoiceTrace({clock:()=>now,record:(event,data)=>rows.push({event,...data})});
 const tr=t.start({turnId:'10:1000:1',endpointMs:700,ms:200,finalQueueMs:150,text:'never log this'});
 await t.run(tr,async()=>{now=10;t.mark('prompt_start');await Promise.resolve();now=30;t.mark('model_dispatch');now=50;t.mark('first_text');t.mark('first_text');t.bindAudio('s1');});
 now=60;t.firstAudio('stale');now=80;t.firstAudio('s1');t.firstAudio('s1');
 assert.deepEqual(rows.map(x=>x.phase??x.event),['alec_voice_final','prompt_start','model_dispatch','first_text','first_audio_received']);
 assert.deepEqual(rows.slice(1).map(x=>x.ms),[10,30,50,80]);assert.ok(!JSON.stringify(rows).includes('never log'));
});
test('invalid native timings are discarded and non-voice marks are ignored',()=>{
 const rows=[];const t=createVoiceTrace({record:(e,d)=>rows.push(d)});t.mark('model_dispatch');
 t.start({ms:-1,endpointMs:Infinity,finalQueueMs:'secret'});
 assert.deepEqual(rows,[{id:null,endpointMs:null,recognitionMs:null,finalQueueMs:null}]);
});

test('packaged runtime self-test checks real conversation functions',()=>assert.deepEqual(conversationSelfTest(),{engine:'ALEC_CONVERSATION_V036',ok:true}));
