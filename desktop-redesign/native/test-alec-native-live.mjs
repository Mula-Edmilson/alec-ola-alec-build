import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./alec-native-live.js',import.meta.url),'utf8');
test('actual native renderer captures only after activation, plays and interrupts audio, cleans mic on stop',async()=>{
 const calls=[],visual={},tracks=[],playing=[],notices=[];let worklet,closed=0,pinned=0,released=0,audioCtx,cameraOpened=0,cameraStopped=0;
 const fakeNode=()=>({connect(){},disconnect(){}});
 const track={stop(){tracks.push('stopped');},addEventListener(){},getSettings(){return {echoCancellation:true};}};
 const R={alecLivePin:()=>pinned++,alecLiveRelease:()=>released++,alecLiveStatus:reason=>notices.push(reason)};
 const ctx={
  window:{Roamie:R,__TAURI__:{core:{invoke:async(name,args)=>{calls.push({name,...args.msg});}}}},
  location:{href:'http://tauri.localhost/desktop.html'},navigator:{mediaDevices:{getUserMedia:async opts=>{if(opts.video){cameraOpened++;return {getTracks:()=>[{stop(){cameraStopped++;}}]};}return {getTracks:()=>[track],getAudioTracks:()=>[track]};}}},
  document:{createElement:tag=>tag==='video'?{videoWidth:640,videoHeight:480,play:async()=>{},pause(){}}:{getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,/9gBAv/Z'}},
  AudioContext:class{constructor(){audioCtx=this;}sampleRate=48000;state='running';currentTime=0;destination={};audioWorklet={addModule:async()=>{}};
   resume=async()=>{};close=async()=>{closed++;};createMediaStreamSource(){return fakeNode();}createAnalyser(){return {...fakeNode(),fftSize:256,getFloatTimeDomainData(){}};}createBuffer(_c,n,rate){return {duration:n/rate,getChannelData:()=>new Float32Array(n)};}createBufferSource(){const node={...fakeNode(),start(){playing.push('start');},stop(){playing.push('stop');}};return node;}},
  AudioWorkletNode:class{constructor(){worklet=this;this.port={};}connect(){}disconnect(){}},
  URL,ArrayBuffer,DataView,Uint8Array,Float32Array,Math,performance,btoa,atob,setTimeout,clearTimeout,setInterval,clearInterval,
  requestAnimationFrame:()=>{},addEventListener:()=>{}
 };
 vm.runInNewContext(source,ctx);
 assert.equal(calls.length,0);const event=(type,data={})=>ctx.window.__alecNativeLive({session:'session-A',type,...data});
 try{
 event('start');await new Promise(r=>setImmediate(r));assert.equal(pinned,1);assert.equal(calls.at(-1).type,'alec_native_live_ready');assert.equal(calls.at(-1).echo,true);
 worklet.port.onmessage({data:new ArrayBuffer(2560)});assert.equal(calls.filter(x=>x.type==='alec_native_live_audio').length,0);
 event('ready');assert.equal(cameraOpened,0);const cameraId='01234567-89ab-cdef-0123-456789abcdef';event('camera_request',{request:cameraId});await new Promise(r=>setTimeout(r,800));assert.equal(cameraOpened,1);assert.equal(cameraStopped,1);assert.equal(calls.at(-1).type,'alec_native_live_camera_result');assert.equal(calls.at(-1).jpeg,'/9gBAv/Z');worklet.port.onmessage({data:new ArrayBuffer(2560)});await new Promise(r=>setImmediate(r));assert.equal(calls.at(-1).type,'alec_native_live_audio');assert.equal(calls.at(-1).pcm.length,3416);
 event('audio',{pcm:'AAAAAA=='});assert.deepEqual(playing,['start']);
 event('interrupt');assert.deepEqual(playing,['start','stop']);
 // Ten seconds delivered in a burst must not end the live session.
 const chunk=btoa('\0'.repeat(48000));
 for(let i=0;i<10;i++)event('audio',{pcm:chunk});
 assert.equal(tracks.length,0);assert.equal(released,0);assert.equal(R.alecNativeLiveSession,'session-A');
 const before=playing.filter(x=>x==='start').length;
 audioCtx.currentTime=10;
 event('audio',{pcm:'AAAAAA=='});assert.ok(playing.filter(x=>x==='start').length>before);
 event('reconnecting');assert.equal(released,0);worklet.port.onmessage({data:new ArrayBuffer(2560)});
 event('ready');event('context_reset');assert.deepEqual(notices,['context_reset']);event('interrupt');assert.equal(tracks.length,0);
 ctx.window.__alecNativeLive({session:'stale',type:'closed'});assert.equal(tracks.length,0);
 event('closed',{reason:'policy_or_quota'});assert.deepEqual(notices,['context_reset','policy_or_quota']);assert.equal(tracks.length,1);assert.equal(closed,1);assert.equal(released,1);assert.equal(R.alecNativeLiveSession,null);
 }finally{R.alecNativeLiveStop();}
});
test('desktop controller does not use browser navigation or a local web server',()=>{
 assert.ok(!/window\.open|location\.assign|fetch\(|https?:\/\//.test(source));assert.match(source,/alec_native_live_send/);
});
