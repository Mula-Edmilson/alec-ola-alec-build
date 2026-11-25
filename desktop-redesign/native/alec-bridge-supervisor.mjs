// ALEC Remote V16 native service supervisor. No shell commands, no elevation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const RUNNER="import ipaddress,json,os,sys,threading\nfrom pathlib import Path\nif sys.version_info < (3,10): raise RuntimeError(\"Python 3.10 required\")\nsys.path.insert(0,sys.argv[1])\nimport server\nbind=os.environ['ALEC_MANAGED_BIND']\naddr=ipaddress.IPv4Address(bind)\nif not any(addr in ipaddress.ip_network(n) for n in ('127.0.0.0/8','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','100.64.0.0/10')): raise ValueError('Private IPv4 required')\nexpected=json.loads(os.environ['ALEC_FILE_ROOTS'])\nactual={str(p) for p in server.FILES.roots}\nif len(actual)!=len(expected) or actual!={str(Path(p).resolve(strict=True)) for p in expected}: raise ValueError('Read folder rejected')\nif os.environ.get('ALEC_TRANSFER_ROOT') and not server.TRANSFERS.info()['enabled']: raise ValueError('Transfer folder rejected')\nwith server.ThreadingHTTPServer((bind,server.PORT),server.Handler) as srv:\n    srv.daemon_threads=True\n    print('ALEC_MANAGED_READY '+json.dumps({'url':f'http://{bind}:{srv.server_address[1]}','code':server.PAIR_CODE,'version':server.VERSION,'roots':list(actual),'transfer':server.TRANSFERS.info()['enabled'],'ask':server.MIRROR_ENABLED}),flush=True)\n    def watch():\n        try: sys.stdin.buffer.read()\n        finally: srv.shutdown()\n    threading.Thread(target=watch,daemon=True).start()\n    srv.serve_forever(poll_interval=0.2)\n";
const HASHES={"bubble_routing.py":"4a649c2ee210d24b865f022f2b4f7f2790b77f1e474737c959cd2272c1864ae3","feedback.py":"e54a18b1f99dfe3df0dd15352d5c582dd8b5263e294fd056380d87a91c5d70c6","files_pc.py":"a28e0f9a842fd5f6f52922f29ef93cbe2d08a61a51f08e37417da41737837932","jobs.py":"912b66ab96d27a903715c3eea6c997893256036cb7710c7baeb7974cf62e9915","listen.py":"bde74f6bcb5be2bc565035f836e81d588c5e3cfea1947a396ecdaea57652d195","live.py":"733e1f2cdcd59cc2b96f5d04cdc69225bc2862b6f14f28728fa76e91a2a86a8c","mirror.py":"b017d79241355fc17c4e7363006f03d51b88611452b5da293679632c751899bd","networking.py":"79a4843ef62ccb85d7f14db20be2cc06572e0cfcb02417b7b1e5faf93281fb5c","notifications.py":"7ddedf34044d81c27746e50ebabe42d353a26c954a9b3ec8000c46d34b1790ea","pcstatus.py":"efddd497cd9aff6bcdba184481f39a96e3e25d83af056068c4b6550c621e2f9a","resources.py":"313684f98b2ab93df883815a8946e99625babd9dc2a03b31cee8acc0856d224c","server.py":"87ad25336458904100bc1b4090a14db60ead49d3bd28f39916f6fb9625b0ea8e","store.py":"e410433dcf1ae852166b4f201b10e525633c9d7a15e081086c773ac1949cd448","transfer.py":"7fda7654f4c2a6d507eb3e600283ec5ff828500a7bb07199f22488391a1a320c","vision.py":"9ab731393d59365819591ab430938d3aa8417e48f587002efacb14bbdc0b7271","voice.py":"ec18a45fc729db8b507b71987ba37ce730b582b744df579d683a5f89be6a29f9","wake.py":"91959debeea7cbf17f5b4d68b54ff1c5b9dc5d1c2076c6f4e793d5efd3eabff9"};

export function privateIPv4(ip){
  if(typeof ip!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip))return false;
  const [a,b,c,d]=ip.split('.').map(Number);
  return [a,b,c,d].every(x=>x>=0&&x<=255) && (a===127||a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127));
}
export function interfaces(){
  return [...new Set(Object.values(os.networkInterfaces()).flat().filter(v=>v&&(v.family==='IPv4'||v.family===4)&&privateIPv4(v.address)).map(v=>v.address))];
}
export function cleanBridgeSettings(input){
  if(!input||typeof input!=='object')throw Error('Configuração inválida.');
  const dir=v=>typeof v==='string'&&v.length<=1000&&path.isAbsolute(v)&&!v.includes('\0')?path.normalize(v):null;
  const project=dir(input.project),python=dir(input.python);
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
  return {project,python,bind:input.bind,roots,transfer,ask:input.ask===true,screen:input.screen===true,camera:input.camera===true,auto:input.auto===true,visionServer:model(input.visionServer),visionModel:model(input.visionModel),ollamaModel:model(input.ollamaModel)};
}
function trustedDirectory(project){
  const dir=path.join(project,'bridge');
  for(const [file,hash] of Object.entries(HASHES)){
    const p=path.join(dir,file);
    if(!fs.lstatSync(p).isFile()||createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==hash)throw Error('Bridge V16 diferente do ZIP auditado. Verifique a instalação.');
  }
  if(!fs.existsSync(path.join(dir,'web','index.html')))throw Error('Pasta web V16 em falta.');
  return dir;
}
export function createBridgeSupervisor({changed=()=>{},ready=()=>{},closed=()=>{}}={}){
  let child=null,timer=null,info={phase:'stopped'},started=null;
  const emit=(next)=>{info=next;changed();};
  function stop(){
    if(!child)return;
    clearTimeout(timer); const c=child;
    emit({phase:'stopping'});
    c.stdin.end();
    timer=setTimeout(()=>{if(child===c)c.kill();},3500);timer.unref();
  }
  function start(input){
    if(child)throw Error('Pare o serviço antes de alterar a configuração.');
    const settings=cleanBridgeSettings(input),dir=trustedDirectory(settings.project);
    if(!fs.statSync(settings.python).isFile())throw Error('Executável Python não encontrado.');
    if(!process.env.ROAMIES_EXE||!fs.existsSync(process.env.ROAMIES_EXE))throw Error('Executável ALEC indisponível.');
    const env={...process.env,ALEC_MANAGED_BIND:settings.bind,ALEC_PORT:'8765',ALEC_ALLOWED_NETWORK:'',ALEC_FILE_ROOTS:JSON.stringify(settings.roots),ALEC_TRANSFER_ROOT:settings.transfer,ALEC_ENABLE_MIRROR:settings.ask?'1':'0',ALEC_ALLOW_PC_SCREEN:settings.screen?'1':'0',ALEC_ALLOW_PC_CAMERA:settings.camera?'1':'0',ALEC_ROAMIES_EXE:process.env.ROAMIES_EXE,ALEC_ROAMIES_DATA:path.join(os.homedir(),'Roamies','Data'),ALEC_BRIDGE_DATA:path.join(os.homedir(),'ALEC-Bridge','Data'),ALEC_VISION_LOCAL_SERVER:settings.visionServer,ALEC_VISION_LOCAL_MODEL:settings.visionModel,ALEC_VISION_MODEL:settings.ollamaModel};
    const args=[...(/^py\.exe$/i.test(path.basename(settings.python))?['-3']:[]),'-I','-B','-u','-c',RUNNER,dir];
    const c=spawn(settings.python,args,{env,cwd:os.homedir(),windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
    child=c;started=settings;emit({phase:'starting'});
    let buf='',failure=null;
    c.stdin.on('error',()=>{});
    c.stderr.resume(); // avoid recording tokens, instructions or paths
    c.stdout.setEncoding('utf8');
    c.stdout.on('data',chunk=>{
      if(child!==c||info.phase!=='starting')return;
      buf+=chunk;
      if(buf.length>131072){failure='Resposta inicial demasiado grande.';c.kill();return;}
      for(let i;(i=buf.indexOf('\n'))>=0;){
        const line=buf.slice(0,i).trim();buf=buf.slice(i+1);
        if(!line.startsWith('ALEC_MANAGED_READY '))continue;
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
      clearTimeout(timer);child=null;started=null;closed();
      emit(failure?{phase:'error',error:failure}:info.phase==='stopping'?{phase:'stopped'}:{phase:'error',error:'Bridge terminou ('+String(code)+'). Verifique a porta 8765, Python e pastas.'});
    });
    timer=setTimeout(()=>{if(child===c&&info.phase==='starting'){failure='Tempo limite no arranque. Confirme Python e porta 8765.';c.kill();}},20000);timer.unref();
    return settings;
  }
  return {start,stop,snapshot:()=>({...info,interfaces:interfaces()}),settings:()=>started};
}
