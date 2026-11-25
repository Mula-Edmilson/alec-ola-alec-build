// ALEC Remote V16 native service supervisor. No shell commands, no elevation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {makePairMatrix,buildPairRunner} from './alec-qr-runtime.mjs';
const execFileAsync=promisify(execFile);
export const RUNNER="import ipaddress,json,os,sys,threading\nfrom pathlib import Path\nif sys.version_info < (3,10): raise RuntimeError(\"Python 3.10 required\")\nsys.path.insert(0,sys.argv[1])\nimport server\nbind=os.environ['ALEC_MANAGED_BIND']\naddr=ipaddress.IPv4Address(bind)\nif not any(addr in ipaddress.ip_network(n) for n in ('127.0.0.0/8','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','100.64.0.0/10')): raise ValueError('Private IPv4 required')\nexpected=json.loads(os.environ['ALEC_FILE_ROOTS'])\nactual={str(p) for p in server.FILES.roots}\nif len(actual)!=len(expected) or actual!={str(Path(p).resolve(strict=True)) for p in expected}: raise ValueError('Read folder rejected')\nif os.environ.get('ALEC_TRANSFER_ROOT') and not server.TRANSFERS.info()['enabled']: raise ValueError('Transfer folder rejected')\nwith server.ThreadingHTTPServer((bind,server.PORT),server.Handler) as srv:\n    srv.daemon_threads=True\n    print('ALEC_MANAGED_READY '+json.dumps({'url':f'http://{bind}:{srv.server_address[1]}','code':server.PAIR_CODE,'version':server.VERSION,'roots':list(actual),'transfer':server.TRANSFERS.info()['enabled'],'ask':server.MIRROR_ENABLED}),flush=True)\n    def watch():\n        try: sys.stdin.buffer.read()\n        finally: srv.shutdown()\n    threading.Thread(target=watch,daemon=True).start()\n    srv.serve_forever(poll_interval=0.2)\n";
const HASHES={"bubble_routing.py":"4a649c2ee210d24b865f022f2b4f7f2790b77f1e474737c959cd2272c1864ae3","feedback.py":"e54a18b1f99dfe3df0dd15352d5c582dd8b5263e294fd056380d87a91c5d70c6","files_pc.py":"a28e0f9a842fd5f6f52922f29ef93cbe2d08a61a51f08e37417da41737837932","jobs.py":"912b66ab96d27a903715c3eea6c997893256036cb7710c7baeb7974cf62e9915","listen.py":"bde74f6bcb5be2bc565035f836e81d588c5e3cfea1947a396ecdaea57652d195","live.py":"733e1f2cdcd59cc2b96f5d04cdc69225bc2862b6f14f28728fa76e91a2a86a8c","mirror.py":"b017d79241355fc17c4e7363006f03d51b88611452b5da293679632c751899bd","networking.py":"79a4843ef62ccb85d7f14db20be2cc06572e0cfcb02417b7b1e5faf93281fb5c","notifications.py":"7ddedf34044d81c27746e50ebabe42d353a26c954a9b3ec8000c46d34b1790ea","pcstatus.py":"efddd497cd9aff6bcdba184481f39a96e3e25d83af056068c4b6550c621e2f9a","resources.py":"313684f98b2ab93df883815a8946e99625babd9dc2a03b31cee8acc0856d224c","server.py":"87ad25336458904100bc1b4090a14db60ead49d3bd28f39916f6fb9625b0ea8e","store.py":"e410433dcf1ae852166b4f201b10e525633c9d7a15e081086c773ac1949cd448","transfer.py":"7fda7654f4c2a6d507eb3e600283ec5ff828500a7bb07199f22488391a1a320c","vision.py":"9ab731393d59365819591ab430938d3aa8417e48f587002efacb14bbdc0b7271","voice.py":"ec18a45fc729db8b507b71987ba37ce730b582b744df579d683a5f89be6a29f9","wake.py":"91959debeea7cbf17f5b4d68b54ff1c5b9dc5d1c2076c6f4e793d5efd3eabff9"};

const ASSETS={"bridge/Capturar-Ecra.ps1":"ebbd41cc181568946e6d69f2b083778865322a5f822e38b4b7b0281b0b4216db","Ler-Chaves-Cloud.ps1":"cd416757c52c4bc8574b1058991a7c5067589e5c007e5aba252e621f85f40672","bridge/web/alec-mark.png":"f4468173878b3cea3ce33703a9f06b48cfdf2d4ced6323c432719c9d7f8e8e34","bridge/web/app.js":"d377071bb6cf76b5fc3d0576a3d3c449cee25e076d5530db2ef0b91fc3e7e99f","bridge/web/assets/alec-mascot-home.png":"efe1923464690859ddad1b727cb9a8bf007b6748335986f9df065fdbc8a1c551","bridge/web/assets/alec-mascot-listen.png":"69c87414514cd046d587cae433b2a0489fb4f46c2f2be91bbbcf3bd0e652803f","bridge/web/files.js":"0151925eb0c359c34a30694b77a91e10b2bf3aec14ec9f237769a50b88022e7b","bridge/web/index.html":"d544b8631a30e1091513c3eee4406f1637b618f43b426c749464749ccd29844f","bridge/web/orb.js":"f8444b5f20310136b5d7a1dc888c446ef8ac995447f44cfdde23578627c40126","bridge/web/styles.css":"03071a68141a97f74324d4e0c6ed682f98fe2102a0435024994ddba7155e51a6","bridge/web/transfer.js":"ef45f7c65671ecbce215ae18475806a7397c4b0e2dbcb19c32d3c485eacca16a","bridge/web/v10.css":"292bf81f9b167461830e97ac536976e35abfafb2601a468fdf1417c4effc53de","bridge/web/v12.css":"4a464476796e8258def5fc7e3efb4b74cce698065884d0b68766f19b16c16829","bridge/web/v13.css":"8de2f2301153a959d5d8f51d48ad2d9f4f3416020a82aef3f651fd1dc3c91ee8","bridge/web/v14.css":"2ec7fb2b27984aee25e85ac16bbeddf7e9f36236b02cb543907fe2288f88d064","bridge/web/v8.css":"5d6fe784f6249b1f05ff41aa8d2469c7faf02a4175517c6d2fe022d49121565f","bridge/web/v9.css":"3aac37d875a0ab652f1b25bb02c1a441f650dc398b2cfec0eac79e07eb5ba19e","bridge/web/vision-routing.js":"a99a9734e315dc7ceb655653b1e9bbb2488140957ac71062f1168786e1c7dee1","bridge/web/voice.js":"8f521adf4ca88ed3278b2bb64f3becd2f5272700bba453b33499eec4be4449ee"};
export const auditedPaths = Object.freeze({...Object.fromEntries(Object.entries(HASHES).map(([p,h])=>['bridge/'+p,h])),...ASSETS});
export function copyAuditedBridge(project,dest){
  if(fs.existsSync(dest))throw Error('Destino do Bridge já existe.');
  const all=Object.entries(auditedPaths).map(([rel,hash])=>{
    const p=path.join(project,...rel.split('/'));
    if(!fs.lstatSync(p).isFile())throw Error('Ficheiro V16 indisponível.');
    const data=fs.readFileSync(p);
    if(createHash('sha256').update(data).digest('hex')!==hash)throw Error('Bridge V16 diferente do ZIP auditado.');
    return [rel,data];
  });
  fs.mkdirSync(dest,{recursive:false,mode:0o700});
  try{for(const [rel,data] of all){const p=path.join(dest,...rel.split('/'));fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,data,{mode:0o600,flag:'wx'});}}
  catch(e){fs.rmSync(dest,{recursive:true,force:true});throw e;}
  return dest;
}
export function bundledProject(){
  const candidate=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','alec-remote');
  return fs.existsSync(path.join(candidate,'bridge','server.py'))?candidate:'';
}
export function pythonDefault(){
  const win=process.env.SystemRoot||process.env.WINDIR||'';
  const local=process.env.LOCALAPPDATA||'';
  const known=[win&&path.join(win,'py.exe'),local&&path.join(local,'Programs','Python','Launcher','py.exe')].filter(Boolean);
  return known.find(p=>fs.existsSync(p))||'';
}

export function parsePersonalFolders(text){
  if(typeof text!=='string'||text.length>65536)throw Error('Script inválido.');
  const matches=[...text.matchAll(/^\s*\$pastas\s*=\s*@\(\s*\r?\n([\s\S]*?)^\s*\)\s*$/gm)];
  if(matches.length!==1)throw Error('Lista de pastas V16 não encontrada.');
  const values=matches[0][1].split(/\r?\n/).filter(line=>line.trim()).map(line=>{
    const m=/^\s*'((?:[^']|'')+)'\s*,?\s*$/.exec(line);
    if(!m)throw Error('A lista contém uma expressão; não será executada.');
    const p=m[1].replace(/''/g,"'");
    if(!/^[A-Za-z]:[\\/]/.test(p)||p.includes('\0')||p.length>1000||p.includes('$'))throw Error('Caminho não literal.');
    return p;
  });
  if(!values.length||values.length>32)throw Error('Quantidade de pastas inválida.');
  return [...new Set(values)];
}
export function readPersonalFolders(project){
  if(typeof project!=='string'||!path.isAbsolute(project)||project.length>1000)throw Error('Indique a pasta original V16.');
  const file=path.join(project,'Iniciar-ALEC-Pessoal.ps1'),st=fs.lstatSync(file);
  if(!st.isFile()||st.size>65536)throw Error('Script pessoal indisponível.');
  return parsePersonalFolders(fs.readFileSync(file,'utf8'));
}

export function privateIPv4(ip){
  if(typeof ip!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip))return false;
  const [a,b,c,d]=ip.split('.').map(Number);
  return [a,b,c,d].every(x=>x>=0&&x<=255) && (a===127||a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127));
}
export function isTailnetIPv4(ip){
  return privateIPv4(ip)&&Number(ip.split('.')[0])===100&&Number(ip.split('.')[1])>=64&&Number(ip.split('.')[1])<=127;
}
// Actual authenticated Tailscale state, not merely an address that looks private.
export async function detectTailnet({run=execFileAsync,active=interfaces,env=process.env,exists=fs.existsSync}={}){
  const candidates=[env.ProgramFiles,env.PROGRAMFILES,env['ProgramFiles(x86)'],env.LOCALAPPDATA].filter(Boolean).map(p=>path.join(p,'Tailscale','tailscale.exe'));
  const bins=[...new Set(candidates.filter(p=>exists(p)))];
  if(!bins.length)throw Error('Tailscale não encontrado. Instala e liga o Tailscale no Windows.');
  for(const executable of bins){
    try{
      const {stdout}=await run(executable,['status','--json'],{timeout:4500,windowsHide:true,shell:false,maxBuffer:4*1024*1024,encoding:'utf8'});
      const status=JSON.parse(stdout);
      const ip=(status.Self?.TailscaleIPs||status.TailscaleIPs||[]).find(v=>isTailnetIPv4(v)&&active().includes(v));
      if(status.BackendState==='Running'&&status.Self?.Online!==false&&ip)return ip;
    }catch{}
  }
  throw Error('Tailscale sem ligação activa. Liga-o no PC e no telefone e tenta novamente.');
}
export function interfaces(){
  return [...new Set(Object.values(os.networkInterfaces()).flat().filter(v=>v&&(v.family==='IPv4'||v.family===4)&&privateIPv4(v.address)).map(v=>v.address))];
}
export function cleanBridgeSettings(input){
  if(!input||typeof input!=='object')throw Error('Configuração inválida.');
  const dir=v=>typeof v==='string'&&v.length<=1000&&path.isAbsolute(v)&&!v.includes('\0')?path.normalize(v):null;
  const project=dir(bundledProject()||input.project),python=dir(input.python);
  if(!project||!python||! /^(?:python|py)\.exe$/i.test(path.basename(python)))throw Error('Indique a pasta V16 e o caminho absoluto de python.exe ou py.exe.');
  if(!privateIPv4(input.bind)||!interfaces().includes(input.bind))throw Error('Escolha um IPv4 privado activo no PC.');
  const raw=Array.isArray(input.roots)?input.roots:[];
  if(raw.length>32||raw.some(v=>!dir(v)))throw Error('Pastas inválidas (máximo 32).');
  const transfer=input.transfer?dir(input.transfer):'';
  if(input.transfer&&!transfer)throw Error('Pasta de recepção inválida.');
  const roots=[...new Set(raw.map(dir))];
  const forbidden=[path.join(os.homedir(),'Roamies'),path.join(os.homedir(),'ALEC-Bridge'),path.join(os.homedir(),'.gg')].map(p=>p.toLowerCase());
  const overlap=(a,b)=>{a=a.toLowerCase();b=b.toLowerCase();return a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep);};
  for(const p of [...roots,...(transfer?[transfer]:[])]){
    if(!fs.statSync(p).isDirectory()||forbidden.some(f=>overlap(p,f)))throw Error('Pasta protegida ou indisponível.');
  }
  const model=v=>typeof v==='string'?v.slice(0,240):'';
  return {project,python,bind:input.bind,tailnet:input.tailnet===true,roots,transfer,ask:input.ask===true,screen:input.screen===true,camera:input.camera===true,auto:input.auto===true,visionServer:model(input.visionServer),visionModel:model(input.visionModel),ollamaModel:model(input.ollamaModel)};
}
export function createBridgeSupervisor({changed=()=>{},ready=()=>{},closed=()=>{}}={}){
  let child=null,timer=null,qrTimer=null,info={phase:'stopped'},started=null;
  const emit=(next)=>{info=next;changed();};
  function renewPairing(){if(child&&info.phase==='running'&&started?.tailnet)child.stdin.write('rotate\n');}
  function revokeDevices(){if(child&&info.phase==='running'&&started?.tailnet)child.stdin.write('revoke-all\n');}
  function stop(){
    if(!child)return;
    clearTimeout(timer);clearTimeout(qrTimer); const c=child;
    emit({phase:'stopping'});
    c.stdin.end();
    timer=setTimeout(()=>{if(child===c)c.kill();},3500);timer.unref();
  }
  function start(input){
    if(child)throw Error('Pare o serviço antes de alterar a configuração.');
    const settings=cleanBridgeSettings(input);
    if(settings.tailnet&&!isTailnetIPv4(settings.bind))throw Error('O Bridge Tailscale exige um IPv4 da tailnet.');
    if(!fs.statSync(settings.python).isFile())throw Error('Executável Python não encontrado.');
    if(!process.env.ROAMIES_EXE||!fs.existsSync(process.env.ROAMIES_EXE))throw Error('Executável ALEC indisponível.');
    const env={...process.env,ALEC_MANAGED_BIND:settings.bind,ALEC_PORT:'8765',ALEC_ALLOWED_NETWORK:settings.tailnet?'100.64.0.0/10':'',ALEC_FILE_ROOTS:JSON.stringify(settings.roots),ALEC_TRANSFER_ROOT:settings.transfer,ALEC_ENABLE_MIRROR:settings.ask?'1':'0',ALEC_ALLOW_PC_SCREEN:settings.screen?'1':'0',ALEC_ALLOW_PC_CAMERA:settings.camera?'1':'0',ALEC_ROAMIES_EXE:process.env.ROAMIES_EXE,ALEC_ROAMIES_DATA:path.join(os.homedir(),'Roamies','Data'),ALEC_BRIDGE_DATA:path.join(os.homedir(),'ALEC-Bridge','Data'),ALEC_VISION_LOCAL_SERVER:settings.visionServer,ALEC_VISION_LOCAL_MODEL:settings.visionModel,ALEC_VISION_MODEL:settings.ollamaModel};
    const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'alec-v16-'));
    let dir;
    try{dir=path.join(copyAuditedBridge(settings.project,path.join(scratch,'source')),'bridge');}catch(e){fs.rmSync(scratch,{recursive:true,force:true});throw e;}
    const args=[...(/^py\.exe$/i.test(path.basename(settings.python))?['-3']:[]),'-I','-B','-u','-c',settings.tailnet?buildPairRunner(RUNNER):RUNNER,dir];
    let c;
    try{c=spawn(settings.python,args,{env,cwd:os.homedir(),windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});}catch(e){fs.rmSync(scratch,{recursive:true,force:true});throw e;}
    child=c;started=settings;emit({phase:'starting'});
    let buf='',failure=null;
    c.stdin.on('error',()=>{});
    c.stderr.resume(); // avoid recording tokens, instructions or paths
    c.stdout.setEncoding('utf8');
    c.stdout.on('data',chunk=>{
      if(child!==c||!['starting','running'].includes(info.phase))return;
      buf+=chunk;
      if(buf.length>131072){failure='Resposta inicial demasiado grande.';c.kill();return;}
      for(let i;(i=buf.indexOf('\n'))>=0;){
        const line=buf.slice(0,i).trim();buf=buf.slice(i+1);
        if(info.phase==='running'&&settings.tailnet){
          if(line.startsWith('ALEC_MANAGED_PAIR ')){
            try{
              const v=JSON.parse(line.slice('ALEC_MANAGED_PAIR '.length));
              if(!Number.isSafeInteger(v.serial)||v.serial<1||v.ttl!==120)throw Error();
              const matrix=makePairMatrix(settings.bind,v.ticket),serial=v.serial;
              clearTimeout(qrTimer);emit({...info,qr:{matrix,serial,expiresAt:Date.now()+120000},paired:false});
              qrTimer=setTimeout(()=>{if(child===c&&info.qr?.serial===serial)emit({...info,qr:null});},120000);qrTimer.unref();
            }catch{clearTimeout(qrTimer);emit({...info,qr:null});}
            continue;
          }
          if(line.startsWith('ALEC_MANAGED_PAIR_ERROR ')){emit({...info,pairError:'Não foi possível revogar os dispositivos.'});continue;}
          if(line.startsWith('ALEC_MANAGED_PAIR_USED ')){
            try{const v=JSON.parse(line.slice('ALEC_MANAGED_PAIR_USED '.length));if(info.qr?.serial===v.serial){clearTimeout(qrTimer);emit({...info,qr:null,paired:true});}}catch{}
            continue;
          }
        }
        if(info.phase!=='starting'||!line.startsWith('ALEC_MANAGED_READY '))continue;
        try{
          const v=JSON.parse(line.slice('ALEC_MANAGED_READY '.length));
          if(v.url!=='http://'+settings.bind+':8765'||!/^\d{6}$/.test(v.code)||v.version!=='16.0.0'||v.ask!==settings.ask||v.transfer!==!!settings.transfer||!Array.isArray(v.roots)||v.roots.length!==settings.roots.length)throw Error();
          clearTimeout(timer);ready(settings);
          emit({phase:'running',url:v.url,code:v.code,version:v.version,roots:v.roots,transfer:v.transfer,ask:v.ask});
        }catch{failure='O Bridge não confirmou a configuração solicitada.';c.kill();}
      }
    });
    c.once('error',()=>{failure='Não foi possível iniciar Python.';});
    c.once('close',code=>{
      if(child!==c)return;
      clearTimeout(timer);clearTimeout(qrTimer);child=null;started=null;try{fs.rmSync(scratch,{recursive:true,force:true});}catch{}closed();
      emit(failure?{phase:'error',error:failure}:info.phase==='stopping'?{phase:'stopped'}:{phase:'error',error:'Bridge terminou ('+String(code)+'). Verifique a porta 8765, Python e pastas.'});
    });
    timer=setTimeout(()=>{if(child===c&&info.phase==='starting'){failure='Tempo limite no arranque. Confirme Python e porta 8765.';c.kill();}},20000);timer.unref();
    return settings;
  }
  return {start,stop,renewPairing,revokeDevices,snapshot:()=>({...info,interfaces:interfaces(),defaults:{project:bundledProject(),python:pythonDefault()}}),settings:()=>started};
}
