// Per-turn duplicate protection and monotonic latency telemetry. Never store words or audio.
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
export const endpointProfile=v=>v==='patient'?'patient':'adaptive';
export function createVoiceGate({limit=128}={}){
 const seen=new Set();
 return {accept(id){
   if(id==null)return true; // compatible with non-Windows helpers
   if(typeof id!=='string'||!/^[0-9]+:[0-9]+:[0-9]+$/.test(id)||id.length>80)return false;
   if(seen.has(id))return false;
   seen.add(id);while(seen.size>limit)seen.delete(seen.values().next().value);
   return true;
 }};
}
export function createVoiceTrace({clock=()=>performance.now(),record=()=>{}}={}){
 const context=new AsyncLocalStorage(),audio=new Map();
 const ms=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=120000?Math.round(v):null;
 const start=m=>{
   const trace={id:typeof m.turnId==='string'?m.turnId:null,at:clock(),seen:new Set()};
   record('alec_voice_final',{id:trace.id,endpointMs:ms(m.endpointMs),recognitionMs:ms(m.ms),finalQueueMs:ms(m.finalQueueMs)});
   return trace;
 };
 const mark=(phase,trace=context.getStore())=>{
   if(!trace||trace.seen.has(phase))return;
   trace.seen.add(phase);
   record('alec_voice_latency',{id:trace.id,phase,ms:Math.max(0,Math.round(clock()-trace.at))});
 };
 const bindAudio=(id,trace=context.getStore())=>{
   if(!trace||!id)return;
   audio.set(id,trace);while(audio.size>64)audio.delete(audio.keys().next().value);
 };
 const firstAudio=id=>{const trace=audio.get(id);if(trace){mark('first_audio_received',trace);audio.delete(id);}};
 return {start,run:(trace,fn)=>context.run(trace,fn),mark,bindAudio,firstAudio};
}
