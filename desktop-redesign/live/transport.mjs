// Original ALEC implementation of the documented Gemini Live WebSocket protocol.
// No third-party assistant code. Credentials never enter the renderer or diagnostic messages.
const ENDPOINT='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
export function createLiveSession({apiKey,model,voice='Charon',socket=url=>new WebSocket(url),emit=()=>{},onClose=()=>{}}){
 if(typeof apiKey!=='string'||!apiKey.trim()||!/^gemini-[a-z0-9.-]+$/.test(model)||!/^[A-Za-z]{1,32}$/.test(voice))throw new Error('Configuração Live inválida');
 let state='connecting',closed=false,ws,chain=Promise.resolve(),setupTimer;
 const close=(why='stopped')=>{if(closed)return;closed=true;state='closed';clearTimeout(setupTimer);try{ws?.close();}catch{}emit({type:'closed',reason:why});onClose();};
 const send=x=>{if(closed||ws?.readyState!==1)return false;if(ws.bufferedAmount>128*1024){close('network_backpressure');return false;}try{ws.send(JSON.stringify(x));return true;}catch{close('send_failed');return false;}};
 ws=socket(ENDPOINT+'?key='+encodeURIComponent(apiKey));
 ws.addEventListener('open',()=>send({setup:{model:'models/'+model,generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:voice}}}},systemInstruction:{parts:[{text:'És ALEC, assistente pessoal. Fala naturalmente em português, com frases curtas e sem saudações não solicitadas. Este protótipo apenas conversa: não tens acesso a ferramentas, ficheiros nem ao computador. Nunca afirmes ter executado tarefas.'}]},inputAudioTranscription:{},outputAudioTranscription:{},realtimeInputConfig:{activityHandling:'START_OF_ACTIVITY_INTERRUPTS',automaticActivityDetection:{disabled:false,prefixPaddingMs:200,silenceDurationMs:650}}}}));
 setupTimer=setTimeout(()=>close('setup_timeout'),15000);setupTimer.unref?.();
 ws.addEventListener('message',e=>{chain=chain.then(async()=>{
  if(closed)return;
  let raw=typeof e.data==='string'?e.data:typeof e.data?.text==='function'?await e.data.text():Buffer.from(e.data).toString('utf8');
  if(closed)return;if(raw.length>2*1024*1024){close('message_limit');return;}
  const m=JSON.parse(raw);
  if(m.setupComplete!==undefined&&state==='connecting'){clearTimeout(setupTimer);state='ready';emit({type:'ready'});}
  if(m.goAway){close('session_limit');return;}
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
 ws.addEventListener('error',()=>close('connection_error'));ws.addEventListener('close',()=>close('connection_closed'));
 return {audio(pcm){if(state!=='ready'||!Buffer.isBuffer(pcm)||pcm.length===0||pcm.length>6400||pcm.length%2)return false;return send({realtimeInput:{audio:{mimeType:'audio/pcm;rate=16000',data:pcm.toString('base64')}}});},close,get state(){return state;}};
}
