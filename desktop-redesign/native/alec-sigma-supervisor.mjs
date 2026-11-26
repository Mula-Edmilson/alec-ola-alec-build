// ALEC Vision: explicit Windows-local launch, DPAPI token and bounded metadata monitoring.
import {createHash,randomBytes} from 'node:crypto';
import {createReadStream,watch} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createSigmaClient,validToken} from './alec-sigma-vision.mjs';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const isDrivePath=p=>typeof p==='string'&&/^[a-z]:[\\/]/i.test(p)&&!p.slice(2).includes(':')&&!p.includes('\0');
const canon=p=>path.resolve(p).toLowerCase();
const within=(root,p)=>{const rel=path.relative(root,p);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
export async function fingerprint(file){
  const h=createHash('sha256');for await(const bytes of createReadStream(file))h.update(bytes);return h.digest('hex');
}
export async function approveSigmaSettings(value,checkRoot){
  if(process.platform!=='win32')throw Error('Supervisor disponível apenas no Windows.');
  if(!isDrivePath(value?.exe)||!Array.isArray(value.roots)||value.roots.length<1||value.roots.length>16)throw Error('Selecciona o executável Sigma e 1–16 pastas específicas.');
  const exe=await fs.realpath(value.exe);if(!isDrivePath(exe)||!/^sigma-file-manager\.exe$/i.test(path.basename(exe))||!(await fs.stat(exe)).isFile())throw Error('Selecciona sigma-file-manager.exe da build ALEC.');
  const roots=[];
  for(const input of value.roots){
    if(!isDrivePath(input))throw Error('Pasta local inválida.');
    const root=await fs.realpath(input);
    if(!isDrivePath(root)||root===path.parse(root).root||!checkRoot(root)||(await fs.stat(root)).isDirectory()!==true)throw Error('Pasta não autorizada.');
    if(!roots.some(r=>canon(r)===canon(root)))roots.push(root);
  }
  return {exe,roots,sha256:await fingerprint(exe),monitor:value.monitor===true};
}
function dpapi(mode,input){
  return new Promise((resolve,reject)=>{
    const sys=process.env.SystemRoot;if(!sys)return reject(Error('Windows DPAPI indisponível.'));
    const exe=path.join(sys,'System32','WindowsPowerShell','v1.0','powershell.exe');
    const commands={protect:"$ErrorActionPreference='Stop'; $v=[Console]::In.ReadToEnd(); ConvertTo-SecureString $v -AsPlainText -Force | ConvertFrom-SecureString",unprotect:"$ErrorActionPreference='Stop'; $v=[Console]::In.ReadToEnd(); $s=ConvertTo-SecureString $v; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}"};
    const child=spawn(exe,['-NoProfile','-NonInteractive','-Command',commands[mode]],{windowsHide:true,stdio:['pipe','pipe','ignore'],shell:false});
    let out='',done=false;const finish=(err,val)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(val);};
    const timer=setTimeout(()=>{child.kill();finish(Error('Windows DPAPI não respondeu.'));},10000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',s=>{out+=s;if(out.length>16384){child.kill();finish(Error('Resposta DPAPI inválida.'));}});
    child.on('error',()=>finish(Error('Windows DPAPI indisponível.')));child.on('close',code=>code===0?finish(null,out.trim()):finish(Error('Não foi possível utilizar a credencial protegida.')));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
export async function loadSigmaToken(folder,protect=dpapi){
  if(!folder||!path.isAbsolute(folder))throw Error('Pasta de credenciais indisponível.');
  await fs.mkdir(folder,{recursive:true});const file=path.join(folder,'sigma-token.dpapi');
  try{const enc=await fs.readFile(file,'utf8');if(enc.length>16384)throw Error('Credencial inválida.');const token=await protect('unprotect',enc);if(!validToken(token))throw Error('Credencial inválida.');return token;}
  catch(e){if(e.code!=='ENOENT')throw Error('Credencial Sigma protegida indisponível. Não será substituída automaticamente.');}
  const token=randomBytes(32).toString('hex'),enc=await protect('protect',token);
  if(!enc||enc===token||enc.includes(token))throw Error('Protecção da credencial falhou.');
  try{await fs.writeFile(file,enc,{flag:'wx',mode:0o600});}
  catch(e){if(e.code==='EEXIST')return loadSigmaToken(folder,protect);throw e;}
  return token;
}
export function createSigmaSupervisor({settings,enabled,checkRoot,folder,onChange=()=>{},launch=spawn,loadToken=loadSigmaToken,probe=token=>createSigmaClient({token,timeout:1000}).status(),pause=wait}){
  let token=null,pending=null,child=null,phase='idle',watchers=[],changes=0,lastChange=null,generation=0,activeSettings=null;
  const configured=()=>{const s=settings();return !!s&&typeof s.exe==='string'&&/^[a-f0-9]{64}$/.test(s.sha256||'')&&Array.isArray(s.roots)&&s.roots.length>0;};
  const snapshot=()=>({phase,configured:configured(),changes,lastChange,watching:watchers.length,settings:configured()?{exe:settings().exe,roots:settings().roots,monitor:settings().monitor===true}:null});
  const emit=()=>{try{onChange();}catch{}};
  function stopWatch(){for(const w of watchers)w.close();watchers=[];}
  function reset(){generation++;stopWatch();token=null;phase='idle';changes=0;lastChange=null;activeSettings=null;emit();}
  function allows(p){if(!configured()||!isDrivePath(p))return false;return settings().roots.some(r=>within(canon(r),canon(p)))&&checkRoot(p)===true;}
  function monitor(s){
    stopWatch();if(!s.monitor)return;
    for(const root of s.roots){try{
      const w=watch(root,{persistent:false,recursive:false},()=>{if(!enabled()||activeSettings!==s)return;changes=Math.min(999999,changes+1);lastChange=Date.now();});
      w.on('error',()=>{w.close();watchers=watchers.filter(x=>x!==w);emit();});watchers.push(w);
    }catch{}}
  }
  function matches(status,s){return status?.protocol===1&&Array.isArray(status.roots)&&JSON.stringify(status.roots.map(canon).sort())===JSON.stringify(s.roots.map(canon).sort());}
  async function ensure(){
    if(!enabled()||!configured())throw Error('Configura primeiro o Sigma e as pastas autorizadas.');
    if(pending)return pending;
    const rev=generation,s=settings();
    const guard=()=>{if(rev!==generation||!enabled()||settings()!==s)throw Error('Configuração Sigma alterada.');};
    pending=(async()=>{
      phase='connecting';emit();
      try{
        guard();token=await loadToken(folder);guard();
        let status;try{status=await probe(token);}catch{}
        guard();
        if(status){if(!matches(status,s))throw Error('Sigma activo com outras permissões. Fecha-o normalmente e tenta novamente.');}
        else{
          const checked=await approveSigmaSettings(s,checkRoot);
          if(checked.sha256!==s.sha256||canon(checked.exe)!==canon(s.exe))throw Error('Executável Sigma mudou; volta a aprová-lo.');
          guard();
          if(child&&child.exitCode===null&&!child.killed)throw Error('Sigma ainda está a iniciar ou não respondeu. Fecha-o normalmente e tenta novamente.');
          const env={};for(const k of ['SystemRoot','WINDIR','SystemDrive','PATH','PATHEXT','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','ProgramData','ProgramFiles','ProgramFiles(x86)','USERNAME','HOMEDRIVE','HOMEPATH','COMSPEC'])if(process.env[k])env[k]=process.env[k];
          const proc=launch(checked.exe,['--sigma-autostart'],{cwd:path.dirname(checked.exe),env:{...env,ALEC_SIGMA_ENABLE:'1',ALEC_SIGMA_TOKEN:token,ALEC_SIGMA_ROOTS:JSON.stringify(checked.roots)},shell:false,windowsHide:true,stdio:'ignore'});
          child=proc;proc.on('error',()=>{if(child===proc)child=null;});proc.on('exit',()=>{if(child===proc)child=null;});proc.unref?.();
          for(let i=0;i<25;i++){guard();await pause(500);try{status=await probe(token);if(status)break;}catch{}}
          guard();if(!matches(status,s))throw Error('Sigma não respondeu com as permissões correctas. Fecha qualquer instância anterior e tenta novamente.');
        }
        guard();phase='connected';if(activeSettings!==s){activeSettings=s;monitor(s);}emit();return status;
      }catch(e){phase='unavailable';stopWatch();emit();throw e;}
    })().finally(()=>{pending=null;});
    return pending;
  }
  return {ensure,configured,allows,reset,snapshot,getToken:()=>token,stopWatch};
}
