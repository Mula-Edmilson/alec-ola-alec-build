/* ALEC native desktop audio controller. No browser launch, no local HTTP server. */
(() => {
 const R=window.Roamie,invoke=window.__TAURI__?.core?.invoke;
 if(!R||!invoke)return;
 let active=null;
 const send=(s,type,data={})=>invoke('alec_native_live_send',{msg:{type,session:s.id,...data}});
 const visual=(s,mode,level=0)=>{if(active===s)R.alecNativeLiveVisual={mode,level:Math.max(0,Math.min(1,level))};};
 function flush(s){for(const node of s.playing)try{node.stop();}catch{}s.playing.clear();s.next=s.ctx?.currentTime||0;}
 function cleanup(s,notify=false,reason='stopped'){
  if(active!==s)return;active=null;clearInterval(s.heartbeat);clearTimeout(s.startDeadline);
  s.stream?.getTracks().forEach(t=>t.stop());s.node?.disconnect();s.source?.disconnect();flush(s);s.ctx?.close().catch(()=>{});
  R.alecNativeLiveVisual=null;R.alecNativeLiveSession=null;R.alecLiveRelease?.();
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
   s.ctx=new AudioContext({sampleRate:48000,latencyHint:'interactive'});await s.ctx.resume();
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
    if(s.frames.length>=8){cleanup(s,true,'audio_backpressure');return;}s.frames.push(frame);pump(s);
   };
   await send(s,'alec_native_live_ready');clearTimeout(s.startDeadline);
  }catch{cleanup(s,true,'microphone_or_audio_unavailable');}
  finally{s.capturing=false;}
 }
 function playback(s,encoded){
  if(!s.ctx||!s.analyser||typeof encoded!=='string'||encoded.length>256000)return;
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));if(!bytes.length||bytes.length%2)return;
  if(s.next-s.ctx.currentTime>4){cleanup(s,true,'playback_backpressure');return;}
  const data=new DataView(bytes.buffer),buffer=s.ctx.createBuffer(1,bytes.length/2,24000),samples=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=data.getInt16(i*2,true)/32768;
  const source=s.ctx.createBufferSource();source.buffer=buffer;source.connect(s.analyser);
  s.next=Math.max(s.ctx.currentTime+.025,s.next);source.start(s.next);s.next+=buffer.duration;s.playing.add(source);source.onended=()=>s.playing.delete(source);
 }
 function animate(){requestAnimationFrame(animate);const s=active;if(!s)return;let mode=s.ready?'listen':'think',level=s.mic||0;
  if(s.playing.size&&s.analyser){const buf=new Float32Array(s.analyser.fftSize);s.analyser.getFloatTimeDomainData(buf);let sum=0;for(const x of buf)sum+=x*x;level=Math.min(1,Math.sqrt(sum/buf.length)*5);mode='talk';}
  visual(s,mode,level);
 }
 requestAnimationFrame(animate);
 R.alecNativeLiveStop=()=>{if(active)cleanup(active,true);};
 window.__alecNativeLive=event=>{
  if(!event||typeof event.session!=='string')return;
  if(event.type==='start'){
   if(active)cleanup(active,false);
   const s={id:event.session,playing:new Set(),frames:[],next:0,ready:false,lastPong:performance.now(),mic:0};active=s;R.alecNativeLiveSession=s.id;R.alecLivePin?.();visual(s,'think');
   s.startDeadline=setTimeout(()=>cleanup(s,true,'audio_start_timeout'),20000);
   s.heartbeat=setInterval(()=>{if(performance.now()-s.lastPong>12000){cleanup(s,true,'sidecar_unavailable');return;}send(s,'alec_native_live_ping').catch(()=>cleanup(s,true,'ipc_failed'));},3000);
   capture(s);return;
  }
  const s=active;if(!s||s.id!==event.session)return;
  if(event.type==='pong'){s.lastPong=performance.now();return;}
  if(event.type==='ready'){s.ready=true;visual(s,'listen');}
  else if(event.type==='audio'){try{playback(s,event.pcm);}catch{cleanup(s,true,'playback_failed');}}
  else if(event.type==='interrupt'){flush(s);visual(s,'listen',s.mic);}
  else if(event.type==='closed'){cleanup(s,false);}
 };
 addEventListener('pagehide',()=>{if(active)cleanup(active,true,'window_closed');});
})();