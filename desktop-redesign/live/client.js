const $=id=>document.getElementById(id),token=location.hash.slice(1);
history.replaceState(null,'',location.pathname);
let session=null;
const headers={'X-Alec-Token':token};
function status(s,text){$('orb').dataset.state=s;$('status').textContent=text;}
function flush(s){for(const source of s.playing)try{source.stop();}catch{}s.playing.clear();s.next=s.ctx?.currentTime||0;}
function cleanup(s,message='Desligado'){
 if(session!==s)return;session=null;s.abort.abort();s.stream?.getTracks().forEach(t=>t.stop());flush(s);s.ctx?.close().catch(()=>{});$('start').disabled=false;$('stop').disabled=true;status('idle',message);
}
function append(id,text){const e=$(id);e.textContent=(e.textContent+text).slice(-8000);e.parentElement.scrollTop=e.parentElement.scrollHeight;}
function playback(s,pcm){
 const bytes=Uint8Array.from(atob(pcm),c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);
 if(s.next-s.ctx.currentTime>5){cleanup(s,'Fila de áudio excedida');return;}
 const buffer=s.ctx.createBuffer(1,bytes.length/2,24000),out=buffer.getChannelData(0);
 for(let i=0;i<out.length;i++)out[i]=view.getInt16(i*2,true)/32768;
 const source=s.ctx.createBufferSource();source.buffer=buffer;source.connect(s.ctx.destination);
 s.next=Math.max(s.ctx.currentTime+0.025,s.next);source.start(s.next);s.next+=buffer.duration;s.playing.add(source);source.onended=()=>s.playing.delete(source);
}
async function pump(s){
 if(s.sending||session!==s)return;s.sending=true;
 try{while(s.frames.length&&session===s){const r=await fetch('/audio',{method:'POST',headers,body:s.frames.shift(),signal:s.abort.signal});if(!r.ok)throw Error('audio');}}
 catch{cleanup(s,'Ligação de áudio interrompida');}finally{s.sending=false;}
}
async function start(){
 if(session)return;const s={abort:new AbortController(),playing:new Set(),next:0,frames:[],sending:false};session=s;$('start').disabled=true;$('stop').disabled=false;$('input').textContent='';$('output').textContent='';status('connecting','A ligar…');
 try{
  s.ctx=new AudioContext({sampleRate:48000,latencyHint:'interactive'});await s.ctx.resume();
  if(s.ctx.sampleRate%16000!==0)throw Error('rate');
  s.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  if(session!==s){s.stream.getTracks().forEach(t=>t.stop());return;}
  $('aec').textContent='Supressão de eco solicitada · '+(s.stream.getAudioTracks()[0].getSettings().echoCancellation?'activa no dispositivo':'não confirmada; utiliza auscultadores');
  await s.ctx.audioWorklet.addModule('/capture.js');
  const r=await fetch('/session',{method:'POST',headers,signal:s.abort.signal});if(!r.ok)throw Error('session');
  const reader=r.body.getReader(),decoder=new TextDecoder();let pending='';
  while(session===s){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});if(pending.length>1024*1024)throw Error('limit');
   const lines=pending.split('\n');pending=lines.pop();
   for(const line of lines){if(!line||session!==s)continue;const e=JSON.parse(line);
    if(e.type==='ready'&&!s.node){s.node=new AudioWorkletNode(s.ctx,'alec-capture');s.source=s.ctx.createMediaStreamSource(s.stream);s.source.connect(s.node);s.node.connect(s.ctx.destination);s.node.port.onmessage=event=>{if(session!==s)return;if(s.frames.length>=8){cleanup(s,'Ligação lenta: sessão terminada');return;}s.frames.push(event.data);pump(s);};status('ready','A escutar · Live');}
    else if(e.type==='audio'){status('ready','A responder · podes interromper');playback(s,e.pcm);}
    else if(e.type==='interrupt'){flush(s);status('ready','A escutar');}
    else if(e.type==='input')append('input',e.text);
    else if(e.type==='output')append('output',e.text);
    else if(e.type==='turn_complete'){append('input','\n');append('output','\n');status('ready','A escutar');}
    else if(e.type==='closed'){cleanup(s,'Sessão terminada: '+e.reason);}
   }
  }
  cleanup(s);
 }catch{cleanup(s,'Não foi possível iniciar ou manter a sessão Live');}
}
$('start').onclick=start;$('stop').onclick=()=>{const s=session;if(s){cleanup(s);fetch('/stop',{method:'POST',headers}).catch(()=>{});}};
addEventListener('pagehide',()=>{if(session)cleanup(session);});
