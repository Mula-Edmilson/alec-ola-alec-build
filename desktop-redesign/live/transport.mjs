// Original ALEC implementation of the documented Gemini Live WebSocket protocol.
// No third-party assistant code. Credentials never enter the renderer or diagnostic messages.
const ENDPOINT='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
export function createLiveSession({apiKey,model,voice='Charon',socket=url=>new WebSocket(url),emit=()=>{},onClose=()=>{},resume=false,handle=null}){
 if(typeof apiKey!=='string'||!apiKey.trim()||!/^gemini-[a-z0-9.-]+$/.test(model)||!/^[A-Za-z]{1,32}$/.test(voice))throw new Error('Configuração Live inválida');
 let state='connecting',closed=false,ws,chain=Promise.resolve(),setupTimer,errorTimer;
 const close=(why='stopped')=>{if(closed)return;closed=true;state='closed';clearTimeout(setupTimer);clearTimeout(errorTimer);try{ws?.close();}catch{}emit({type:'closed',reason:why});onClose(why);};
 const send=x=>{if(closed||ws?.readyState!==1)return false;if(ws.bufferedAmount>128*1024){close('network_backpressure');return false;}try{ws.send(JSON.stringify(x));return true;}catch{close('send_failed');return false;}};
 ws=socket(ENDPOINT+'?key='+encodeURIComponent(apiKey));
 ws.addEventListener('open',()=>send({setup:{model:'models/'+model,...(resume?{sessionResumption:handle?{handle}:{},contextWindowCompression:{slidingWindow:{}}}:{}),generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:voice}}}},systemInstruction:{parts:[{text:'És ALEC, assistente pessoal. Fala naturalmente em português, com frases curtas e sem saudações não solicitadas. Este protótipo apenas conversa: não tens acesso a ferramentas, ficheiros nem ao computador. Nunca afirmes ter executado tarefas.'}]},inputAudioTranscription:{},outputAudioTranscription:{},realtimeInputConfig:{activityHandling:'START_OF_ACTIVITY_INTERRUPTS',automaticActivityDetection:{disabled:false,prefixPaddingMs:200,silenceDurationMs:650}}}}));
 setupTimer=setTimeout(()=>close('setup_timeout'),15000);setupTimer.unref?.();
 ws.addEventListener('message',e=>{chain=chain.then(async()=>{
  if(closed)return;
  let raw=typeof e.data==='string'?e.data:typeof e.data?.text==='function'?await e.data.text():Buffer.from(e.data).toString('utf8');
  if(closed)return;if(raw.length>2*1024*1024){close('message_limit');return;}
  const m=JSON.parse(raw);
  if(m.setupComplete!==undefined&&state==='connecting'){clearTimeout(setupTimer);state='ready';emit({type:'ready'});}
  if(m.sessionResumptionUpdate&&resume){const u=m.sessionResumptionUpdate;emit({type:'checkpoint',handle:u.resumable&&typeof u.newHandle==='string'?u.newHandle:null});}
  if(m.goAway){
   if(!resume){close('session_limit');return;}
   const raw=String(m.goAway.timeLeft||'');const seconds=/^\d+(?:\.\d+)?s$/.test(raw)?Number(raw.slice(0,-1)):5;
   emit({type:'go_away',remainingMs:Math.max(0,Math.min(600000,seconds*1000))});
  }
  if(state!=='ready')return;
  if(m.toolCall){close('unexpected_tool');return;} // no tools declared in this prototype
  const c=m.serverContent;if(!c)return;
  if(c.interrupted){emit({type:'interrupt'});}
  if(c.inputTranscription?.text)emit({type:'input',text:String(c.inputTranscription.text).slice(0,8000)});
  if(c.outputTranscription?.text&&!c.interrupted)emit({type:'output',text:String(c.outputTranscription.text).slice(0,8000)});
  if(!c.interrupted)for(const part of c.modelTurn?.parts||[]){
   const a=part.inlineData;
   if(a&&/^audio\/pcm(?:;\s*rate=24000)?$/i.test(a.mimeType)&&typeof a.data==='string'&&a.data.length<=256000&&/^[A-Za-z0-9+/]+={0,2}$/.test(a.data)){
    const bytes=Buffer.from(a.data,'base64');if(bytes.length&&bytes.length%2===0)emit({type:'audio',pcm:a.data});
   }
  }
  if(c.turnComplete)emit({type:'turn_complete'});
 }).catch(()=>close('invalid_response'));});
 // Prefer the actual close status over a preceding generic WebSocket error. Never log the provider's raw reason.
 ws.addEventListener('error',()=>{if(!closed&&!errorTimer){errorTimer=setTimeout(()=>close('connection_error'),750);errorTimer.unref?.();}});
 ws.addEventListener('close',e=>close(e.code===1008?'policy_or_quota':e.code===1009?'message_limit':e.code===1013?'provider_overloaded':'connection_closed'));
 return {audio(pcm){if(state!=='ready'||!Buffer.isBuffer(pcm)||pcm.length===0||pcm.length>6400||pcm.length%2)return false;return send({realtimeInput:{audio:{mimeType:'audio/pcm;rate=16000',data:pcm.toString('base64')}}});},close,get state(){return state;}};
}

// Native-only recovery. Keep the logical session and its Orb alive across sockets.
// Never persist the resumption handle or send it to the renderer.
export function createResilientLiveSession({emit=()=>{},onClose=()=>{},retryDelay=1000,stableMs=30000,...opts}){
 let current=null,handle=null,closed=false,state='connecting',timer=null,stableTimer=null,renewTimer=null,epoch=0,everReady=false,attempts=0,goAway=false;
 const clearTimers=()=>{clearTimeout(timer);clearTimeout(stableTimer);clearTimeout(renewTimer);timer=stableTimer=renewTimer=null;};
 function finish(reason='stopped'){if(closed)return;closed=true;state='closed';++epoch;clearTimers();const s=current;current=null;handle=null;s?.close(reason);emit({type:'closed',reason});onClose(reason);}
 function retry(reason){
  if(closed)return;
  clearTimers();
  if(!['connection_error','connection_closed','send_failed','network_backpressure','setup_timeout','session_limit','provider_overloaded'].includes(reason)||attempts>=3){finish(reason);return;}
  state='connecting';current=null;attempts++;emit({type:'reconnecting',reason,attempt:attempts});
  timer=setTimeout(open,retryDelay*attempts);timer.unref?.();
 }
 function open(){
  if(closed)return;
  const id=++epoch,hadContext=!!handle,wasReady=everReady;
  goAway=false;
  try{
   current=createLiveSession({...opts,resume:true,handle,emit:e=>{
    if(closed||id!==epoch)return;
    if(e.type==='checkpoint'){handle=e.handle;return;}
    if(e.type==='go_away'){
     goAway=true;clearTimeout(renewTimer);
     // Renew at a completed turn where possible; otherwise leave a safety margin
     // before Google's announced disconnect, including idle conversations.
     renewTimer=setTimeout(()=>{if(!closed&&id===epoch)current?.close('session_limit');},Math.max(0,e.remainingMs-1500));renewTimer.unref?.();return;
    }
    if(e.type==='closed')return;
    if(e.type==='ready'){
     state='ready';everReady=true;
     // A socket that connects and immediately fails is not a successful recovery.
     stableTimer=setTimeout(()=>{if(!closed&&id===epoch&&state==='ready')attempts=0;},stableMs);stableTimer.unref?.();
     if(wasReady&&!hadContext)emit({type:'context_reset'});
    }
    emit(e);
    if(e.type==='turn_complete'&&goAway)current?.close('session_limit');
   },onClose:reason=>{if(!closed&&id===epoch)retry(reason);}});
  }catch{retry('connection_error');}
 }
 open();
 return {audio:pcm=>state==='ready'&&!!current?.audio(pcm),close:finish,get state(){return state;}};
}
