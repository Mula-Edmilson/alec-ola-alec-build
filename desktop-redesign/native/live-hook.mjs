// ALEC_REMOTE_V11_HOOK — local telemetry, mailbox and opt-in voice mirror.
import * as alecFs from 'node:fs';
import * as alecPath from 'node:path';
import * as alecOs from 'node:os';
import { AsyncLocalStorage as AlecAsyncLocalStorage } from 'node:async_hooks';
const alecContext=new AlecAsyncLocalStorage();
const alecOrigins=new Map();
function alecSpeechOrigin(id){alecOrigins.set(id,alecContext.getStore()||null);if(alecOrigins.size>256)alecOrigins.delete(alecOrigins.keys().next().value);}
const alecDir = alecPath.join(alecOs.homedir(), 'ALEC-Bridge', 'Data', 'live-v9');
const alecInstance = `${process.pid}-${Date.now()}`;
let alecState = {instance:alecInstance, seq:0, reply:'', speech:'', phase:'idle', microphone:'unknown', audioUntil:0, audioAt:0, level:0};
let alecSpoken = new Map(), alecSpeechId = null, alecCurrent = null, alecFailed = false;
let alecAudio = [], alecClock = 0, alecReady = false;
const alecLimit = x => String(x ?? '').slice(0,100000);
function alecAtomic(name, value) {
  const dest=alecPath.join(alecDir,name), tmp=dest+'.'+process.pid+'.tmp';
  try { alecFs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600}); alecFs.renameSync(tmp,dest); return true; } catch { try{alecFs.unlinkSync(tmp)}catch{} return false; }
}

// Bounded, short-lived PCM spool, enabled only while an authenticated player polls.
const alecAudioDir=alecPath.join(alecDir,'voice');
const alecRing=360;
let alecVoiceSeq=0,alecVoiceEpoch=0,alecVoiceOwner=null,alecVoiceFirst=1;
function alecVoiceLease(){try{const v=JSON.parse(alecFs.readFileSync(alecPath.join(alecDir,'voice-lease.json'),'utf8'));const now=Date.now();if(v.instance===alecInstance&&typeof v.owner==='string'&&v.mode==='auto'&&typeof v.device==='string'&&v.until>now&&v.until<=now+4500)return v;}catch{}return null;}
function alecVoiceIndex(){return alecAtomic('voice-index.json',{instance:alecInstance,owner:alecVoiceOwner,epoch:alecVoiceEpoch,head:alecVoiceSeq,first:alecVoiceFirst});}
function alecVoiceClear(owner=null){try{for(const f of alecFs.readdirSync(alecAudioDir)){if(/^\d+\.json(?:\.\d+\.tmp)?$/.test(f))try{alecFs.unlinkSync(alecPath.join(alecAudioDir,f));}catch{}}}catch{}alecVoiceOwner=owner;alecVoiceEpoch++;alecVoiceFirst=alecVoiceSeq+1;alecVoiceIndex();}
function alecVoiceTick(){const lease=alecVoiceLease();if((lease?.owner??null)!==alecVoiceOwner){alecVoiceClear(lease?.owner??null);} }
function alecVoiceMirror(m){try{
 if(m.kind!=='speech')return m;
 alecVoiceTick();const lease=alecVoiceLease();
 if(m.stop){if(alecVoiceOwner)alecVoiceClear(alecVoiceOwner);return m;}
 if(typeof m.pcm!=='string'||!Number.isInteger(m.rate)||m.rate<8000||m.rate>96000)return m;
 const device=alecOrigins.get(m.id);
 if(!device)return m; // Local or unsolicited speech never leaves the PC.
 const muted={...m,pcm:Buffer.alloc(Buffer.from(m.pcm,'base64').length).toString('base64')};
 if(!lease||lease.device!==device||alecVoiceOwner!==lease.owner)return muted;
 // A remote reply never falls back to audible PC playback.
 const raw=Buffer.from(m.pcm,'base64');if(!raw.length||raw.length%2||raw.length>8_000_000)return muted;
 const size=Math.max(2,Math.floor(m.rate/4)*2);
 // Each packet is at most 250ms, mono signed 16-bit LE, identical to Roamies PCM.
 for(let off=0;off<raw.length;off+=size){const seq=alecVoiceSeq+1,slot=seq%alecRing,chunk=raw.subarray(off,Math.min(raw.length,off+size));const dest=alecPath.join(alecAudioDir,slot+'.json'),tmp=dest+'.'+process.pid+'.tmp';try{alecFs.writeFileSync(tmp,JSON.stringify({instance:alecInstance,owner:lease.owner,epoch:alecVoiceEpoch,seq,rate:m.rate,pcm:chunk.toString('base64'),caption:alecLimit(alecState.speech).slice(-16000)}),{mode:0o600});alecFs.renameSync(tmp,dest);}catch(e){try{alecFs.unlinkSync(tmp)}catch{}throw e;}alecVoiceSeq=seq;alecVoiceFirst=Math.max(alecVoiceFirst,seq-alecRing+1);}
 alecVoiceIndex();
 // Keep renderer timing and reply_said intact; only zero samples for explicit phone-only mode.
 return muted;
 }catch{}return m.kind==='speech'&&typeof m.pcm==='string'&&alecOrigins.get(m.id)?{...m,pcm:Buffer.alloc(Buffer.from(m.pcm,'base64').length).toString('base64')}:m;}

function alecPublish() {
  try {
    alecVoiceTick();
    const now=Date.now();
    alecAudio=alecAudio.filter(x=>x.end>now);
    const block=alecAudio.find(x=>x.start<=now&&x.end>now);
    alecState.level=block?.level??0;
    alecAtomic('state.json',{...alecState,heartbeat:now, voiceMirror:true,voiceAuto:true,voiceOrigin:alecOrigins.get(alecSpeechId)?'remote':'pc',speaking:alecState.audioUntil>now,seq:++alecState.seq});
  } catch {}
}
function alecSay(id,text) {try { const s=alecLimit(text).replace(/\[[^\]\n]{1,30}\]\s*/g,'').trim(); if(!s)return; if(alecSpoken.size>32)alecSpoken.clear(); alecSpoken.set(id,alecLimit((alecSpoken.get(id)||'')+' '+s).trim()); if(alecSpeechId===id)alecState.speech=alecSpoken.get(id); }catch{}}
function alecStopSpeech(){alecAudio=[];alecClock=0;alecState.audioUntil=0;alecState.level=0;alecSpeechId=null;}
function alecUi(m){try {
  if(m.kind==='agent'){
    const e=m.e||{};
    if(e.type==='start'){alecState.reply='';alecState.speech='';alecState.phase='working';alecFailed=false;}
    else if(e.type==='text'&&typeof e.text==='string'){alecState.reply=alecLimit(alecState.reply+e.text);alecState.phase='working';}
    else if(e.type==='done')alecState.phase='idle';
    else if(e.type==='error'){alecFailed=true;alecState.phase='error';if(typeof e.message==='string')alecState.reply=alecLimit(e.message);}
  } else if(m.kind==='say'&&typeof m.text==='string'){alecState.reply=alecLimit(m.text);}
  else if(m.kind==='speech'){
    if(m.stop){alecStopSpeech();return;}
    if(typeof m.pcm==='string'&&Number.isFinite(m.rate)&&m.rate>0){
      if(alecSpeechId!==m.id){alecStopSpeech();alecSpeechId=m.id;}
      alecState.speech=alecSpoken.get(m.id)||'';
      const b=Buffer.from(m.pcm,'base64'), now=Date.now(), start=Math.max(now,alecClock), samples=Math.floor(b.length/2);
      const step=Math.max(1,Math.floor(m.rate*.08));
      for(let i=0;i<samples;i+=step){let sq=0,n=0;for(let j=i;j<Math.min(samples,i+step);j+=4){const v=b.readInt16LE(j*2)/32768;sq+=v*v;n++;}const a=start+i/m.rate*1000,z=start+Math.min(samples,i+step)/m.rate*1000;alecAudio.push({start:a,end:z,level:Math.min(1,Math.sqrt(sq/Math.max(1,n))*5)});}
      alecClock=start+samples/m.rate*1000;alecState.audioAt=now;alecState.audioUntil=alecClock; if(alecAudio.length>5000)alecAudio=alecAudio.slice(-5000);
    }
  }
} catch {}}
function alecMic(m){try{if(m.type==='voice_state'&&['idle','listening','processing'].includes(m.state))alecState.microphone=m.state;}catch{}}
function alecReceipt(id,state,extra={}){alecAtomic(id+'.receipt.json',{id,instance:alecInstance,state,...extra});}
function alecBegin(id){if(!id)return;alecCurrent=id;alecState.reply='';alecState.speech='';alecState.phase='working';alecFailed=false;alecReceipt(id,'running');}
function alecFinish(id){if(!id)return;alecReceipt(id,alecFailed||!alecState.reply.trim()?'unconfirmed':'answered',{reply:alecState.reply});alecCurrent=null;if(alecState.phase==='working')alecState.phase=alecFailed?'error':'idle';}
function alecMailbox(){try {
  // Bridge has to explicitly enable direct commands. No socket or new network listener.
  if(!alecReady||!alecFs.existsSync(alecPath.join(alecDir,'enabled')))return;
  for(const name of alecFs.readdirSync(alecDir)){
    if(!/^[a-f0-9]{32}\.request\.json$/.test(name))continue;
    const file=alecPath.join(alecDir,name), id=name.split('.')[0], claimed=alecPath.join(alecDir,id+'.claimed.json');
    // Exclusive claim survives restart; no replay after an ambiguous crash.
    let fd;try{fd=alecFs.openSync(claimed,'wx',0o600);}catch{continue;}try{alecFs.closeSync(fd);}catch{}
    try {
      const raw=alecFs.readFileSync(file,'utf8');alecFs.unlinkSync(file);const r=JSON.parse(raw);
      if(r.id!==id||r.instance!==alecInstance||typeof r.text!=='string'||!r.text.trim()||r.text.length>2500||!Number.isFinite(r.expires)||Date.now()>r.expires){alecReceipt(id,'unconfirmed');continue;}
      alecReceipt(id,'received');enqueue(r.text.trim(),{remoteId:id,remoteDevice:typeof r.device==='string'&&/^[a-f0-9]{64}$/.test(r.device)?r.device:null});
    } catch {alecReceipt(id,'unconfirmed');}
  }
} catch{}}
try {alecFs.mkdirSync(alecDir,{recursive:true,mode:0o700});alecFs.mkdirSync(alecAudioDir,{recursive:true,mode:0o700});alecVoiceClear();setInterval(()=>{if(alecReady){alecPublish();alecMailbox();}},250).unref();}catch{}

