/* ALEC native desktop audio controller. No browser launch, no local HTTP server. */
(() => {
 const R=window.Roamie,invoke=window.__TAURI__?.core?.invoke;
 if(!R||!invoke)return;
 let active=null;
 const send=(s,type,data={})=>invoke('alec_native_live_send',{msg:{type,session:s.id,...data}});
 const visual=(s,mode,level=0)=>{if(active===s)R.alecNativeLiveVisual={mode,level:Math.max(0,Math.min(1,level))};};
 const PLAYBACK_WINDOW=1.5, MAX_PENDING_BYTES=120*24000*2, MAX_PENDING_CHUNKS=2048;
 function flush(s){s.pending=[];s.pendingBytes=0;for(const node of s.playing)try{node.stop();}catch{}s.playing.clear();s.next=s.ctx?.currentTime||0;}
 function cancelCamera(s,request=null){
  const c=s.camera;if(!c||request&&c.id!==request)return;
  s.camera=null;clearTimeout(c.timer);c.stream?.getTracks().forEach(t=>t.stop());if(c.video){c.video.pause();c.video.srcObject=null;}
 }
 async function camera(s,id){
  if(active!==s||!s.ready||s.camera||typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))return;
  const c={id,stream:null,video:null,timer:null};s.camera=c;
  const valid=()=>active===s&&s.camera===c&&s.ready;
  const result=async jpeg=>{if(!valid())return;cancelCamera(s,id);try{await send(s,'alec_native_live_camera_result',{request:id,...(jpeg?{jpeg}:{error:'camera_unavailable'})});}catch{}};
  c.timer=setTimeout(()=>{void result(null);},11000);
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},facingMode:'user'}});
   if(!valid()){stream.getTracks().forEach(t=>t.stop());return;}c.stream=stream;
   const video=document.createElement('video');c.video=video;video.muted=true;video.playsInline=true;video.srcObject=stream;await video.play();
   await new Promise(resolve=>setTimeout(resolve,700));if(!valid())return;
   if(!video.videoWidth||!video.videoHeight)throw Error('camera_unavailable');
   const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('camera_unavailable');ctx.drawImage(video,0,0,canvas.width,canvas.height);
   const uri=canvas.toDataURL('image/jpeg',.75),prefix='data:image/jpeg;base64,';
   if(!uri.startsWith(prefix)||uri.length>700023)throw Error('camera_unavailable');
   await result(uri.slice(prefix.length));
  }catch{await result(null);}finally{if(s.camera===c)cancelCamera(s,id);}
 }
 function cleanup(s,notify=false,reason='stopped'){
  if(active!==s)return;cancelCamera(s);active=null;clearInterval(s.heartbeat);clearInterval(s.playbackTimer);clearTimeout(s.startDeadline);
  s.stream?.getTracks().forEach(t=>t.stop());s.node?.disconnect();s.source?.disconnect();flush(s);s.ctx?.close().catch(()=>{});
  R.alecNativeLiveVisual=null;R.alecNativeLiveSession=null;R.alecLiveRelease?.();
  if(reason!=='stopped')R.alecLiveStatus?.(reason);
  if(notify)send(s,'alec_native_live_stop',{reason}).catch(()=>{});
 }
 function pcm(buffer){const bytes=new Uint8Array(buffer);let str='';for(const b of bytes)str+=String.fromCharCode(b);return btoa(str);}
 function rms(buffer){const v=new DataView(buffer);let total=0;for(let i=0;i<v.byteLength;i+=2){const x=v.getInt16(i,true)/32768;total+=x*x;}return Math.min(1,Math.sqrt(total/(v.byteLength/2))*5);}
 async function pump(s){if(s.sending||active!==s)return;s.sending=true;
  try{while(active===s&&s.frames.length){const frame=s.frames.shift();await send(s,'alec_native_live_audio',{pcm:pcm(frame)});}}
  catch{cleanup(s,true,'ipc_failed');}finally{s.sending=false;}
 }
 async function capture(s){
  if(active!==s||s.capturing||s.node)return;s.capturing=true;
  try{
   s.ctx??=new AudioContext({sampleRate:48000,latencyHint:'interactive'});
   await Promise.race([s.ctx.resume(),new Promise(resolve=>setTimeout(resolve,900))]);
   if(active!==s)return;
   if(s.ctx.state!=='running'){s.waitingGesture=true;R.alecLiveGestureHint?.();return;}
   s.waitingGesture=false;
   if(active!==s)return;
   if(s.ctx.state!=='running'||s.ctx.sampleRate%16000!==0)throw Error('audio_unavailable');
   s.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(active!==s){s.stream.getTracks().forEach(t=>t.stop());return;}
   for(const t of s.stream.getAudioTracks())t.addEventListener('ended',()=>cleanup(s,true,'microphone_ended'),{once:true});
   await s.ctx.audioWorklet.addModule(new URL('roamies/alec-live-capture.js',location.href));
   if(active!==s)return;
   s.analyser=s.ctx.createAnalyser();s.analyser.fftSize=256;s.analyser.connect(s.ctx.destination);
   s.source=s.ctx.createMediaStreamSource(s.stream);s.node=new AudioWorkletNode(s.ctx,'alec-capture');
   s.source.connect(s.node);s.node.connect(s.ctx.destination);
   s.node.port.onmessage=e=>{
    if(active!==s||!s.ready)return;const frame=e.data;if(!(frame instanceof ArrayBuffer)||frame.byteLength!==2560)return;
    s.mic=rms(frame);
    if(s.frames.length>=32){cleanup(s,true,'audio_backpressure');return;}s.frames.push(frame);pump(s);
   };
   const settings=s.stream.getAudioTracks()[0]?.getSettings?.()||{};
   await send(s,'alec_native_live_ready',{echo:typeof settings.echoCancellation==='boolean'?settings.echoCancellation:null});clearTimeout(s.startDeadline);
  }catch{cleanup(s,true,'microphone_or_audio_unavailable');}
  finally{s.capturing=false;}
 }
 function playback(s,encoded){
  if(!s.ctx||!s.analyser||typeof encoded!=='string'||encoded.length>256000)return;
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));if(!bytes.length||bytes.length%2)return;
  if(s.pendingBytes+bytes.length>MAX_PENDING_BYTES||s.pending.length>=MAX_PENDING_CHUNKS){cleanup(s,true,'playback_capacity_exceeded');return;}
  s.pending.push(bytes);s.pendingBytes+=bytes.length;drain(s);
 }
 function drain(s){
  if(active!==s||!s.ctx||!s.analyser)return;
  try{while(s.pending.length&&s.next-s.ctx.currentTime<PLAYBACK_WINDOW&&s.playing.size<256){
   const bytes=s.pending.shift();s.pendingBytes-=bytes.length;
   const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),buffer=s.ctx.createBuffer(1,bytes.length/2,24000),samples=buffer.getChannelData(0);
   for(let i=0;i<samples.length;i++)samples[i]=data.getInt16(i*2,true)/32768;
   const source=s.ctx.createBufferSource();source.buffer=buffer;source.connect(s.analyser);
   s.next=Math.max(s.ctx.currentTime+.025,s.next);source.start(s.next);s.next+=buffer.duration;s.playing.add(source);
   source.onended=()=>{s.playing.delete(source);if(active===s)drain(s);};
  }}catch{cleanup(s,true,'playback_failed');}
 }
 function animate(){requestAnimationFrame(animate);const s=active;if(!s)return;let mode=s.ready?'listen':'think',level=s.mic||0;
  if(s.playing.size&&s.analyser){const buf=new Float32Array(s.analyser.fftSize);s.analyser.getFloatTimeDomainData(buf);let sum=0;for(const x of buf)sum+=x*x;level=Math.min(1,Math.sqrt(sum/buf.length)*5);mode='talk';}
  visual(s,mode,level);
 }
 requestAnimationFrame(animate);
 R.alecNativeLiveStop=()=>{if(active)cleanup(active,true);};
 R.alecNativeLiveResume=()=>{if(active?.waitingGesture){capture(active);return true;}return false;};
 window.__alecNativeLive=event=>{
  if(!event||typeof event.session!=='string')return;
  if(event.type==='start'){
   if(active)cleanup(active,false);
   const s={id:event.session,playing:new Set(),pending:[],pendingBytes:0,frames:[],next:0,ready:false,lastPong:performance.now(),mic:0};active=s;R.alecNativeLiveSession=s.id;R.alecLivePin?.();visual(s,'think');
   s.startDeadline=setTimeout(()=>cleanup(s,true,'audio_start_timeout'),20000);
   s.heartbeat=setInterval(()=>{if(performance.now()-s.lastPong>20000){cleanup(s,true,'sidecar_unavailable');return;}send(s,'alec_native_live_ping',{playing:s.playing.size>0||s.pending.length>0}).catch(()=>cleanup(s,true,'ipc_failed'));},3000);
   s.playbackTimer=setInterval(()=>drain(s),50);capture(s);return;
  }
  const s=active;if(!s||s.id!==event.session)return;
  if(event.type==='pong'){s.lastPong=performance.now();return;}
  if(event.type==='camera_request'){void camera(s,event.request);return;}
  if(event.type==='camera_cancel'){cancelCamera(s,event.request);return;}
  if(event.type==='ready'){s.ready=true;visual(s,'listen');}
  else if(event.type==='context_reset'){R.alecLiveStatus?.('context_reset');}
  else if(event.type==='audio'){try{playback(s,event.pcm);}catch{cleanup(s,true,'playback_failed');}}
  else if(event.type==='interrupt'){flush(s);visual(s,'listen',s.mic);}
   else if(event.type==='reconnecting'){cancelCamera(s);s.ready=false;s.frames=[];visual(s,'think');}
  else if(event.type==='closed'){cleanup(s,false,typeof event.reason==='string'?event.reason:'connection_closed');}
 };
 addEventListener('pagehide',()=>{if(active)cleanup(active,true,'window_closed');});
})();