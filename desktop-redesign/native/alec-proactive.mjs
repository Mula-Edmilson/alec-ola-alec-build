// ALEC Proactive Intelligence: original, offline and read-only diagnostics.
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
const run=promisify(execFile);
export const DEFAULT_SETTINGS=Object.freeze({enabled:false,system:true,foreground:false,clipboard:false,alerts:false});
export function settings(v){return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k,d])=>[k,typeof v?.[k]==='boolean'?v[k]:d]));}
const pct=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100?Math.round(n):null;
const name=v=>typeof v==='string'&&/^[\p{L}\p{N}_. ()-]{1,80}$/u.test(v)?v:null;
const num=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
const cpuTotal=()=>os.cpus().reduce((a,c)=>{a.idle+=c.times.idle;a.total+=Object.values(c.times).reduce((x,y)=>x+y,0);return a;},{idle:0,total:0});
export function cpuPercent(a,b){const t=b.total-a.total,i=b.idle-a.idle;return t>0&&i>=0?pct(100*(1-i/t)):null;}
// Constant PowerShell program: no arbitrary input or clipboard text, no window titles.
const WIN_SCRIPT=String.raw`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class AlecLocalVitals {
 [StructLayout(LayoutKind.Sequential)] public struct PowerStatus { public byte AC; public byte Flag; public byte Percent; public byte Reserved; public uint Life; public uint FullLife; }
 [DllImport("kernel32.dll")] public static extern bool GetSystemPowerStatus(out PowerStatus s);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
 [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
 [DllImport("user32.dll")] public static extern bool IsClipboardFormatAvailable(uint format);
}
'@
$o=[ordered]@{battery=$null;ac=$null;app=$null;clipSeq=$null;clipType=$null;processes=@()}
if (__SYSTEM__) {
 $p=New-Object AlecLocalVitals+PowerStatus
 if ([AlecLocalVitals]::GetSystemPowerStatus([ref]$p) -and ($p.Flag -band 128) -eq 0 -and $p.Percent -le 100) {
  $o.battery=[int]$p.Percent
  if ($p.AC -le 1) { $o.ac=($p.AC -eq 1) }
 }
}
if (__FOREGROUND__) {
 try { [uint32]$processId=0; $h=[AlecLocalVitals]::GetForegroundWindow(); if($h -ne [IntPtr]::Zero){ [void][AlecLocalVitals]::GetWindowThreadProcessId($h,[ref]$processId); if($processId){$o.app=(Get-Process -Id $processId -ErrorAction Stop).ProcessName} } } catch {}
}
if (__CLIPBOARD__) {
 $o.clipSeq=[long][AlecLocalVitals]::GetClipboardSequenceNumber()
 if([AlecLocalVitals]::IsClipboardFormatAvailable(15)){$o.clipType='files'}
 elseif([AlecLocalVitals]::IsClipboardFormatAvailable(8) -or [AlecLocalVitals]::IsClipboardFormatAvailable(2)){$o.clipType='image'}
 elseif([AlecLocalVitals]::IsClipboardFormatAvailable(13)){$o.clipType='text'}
 else{$o.clipType='other'}
}
if (__DETAILS__) {
 $o.processes=@(Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 | ForEach-Object { @{name=$_.ProcessName;ramMiB=[math]::Round($_.WorkingSet64/1MB)} })
}
$o | ConvertTo-Json -Compress -Depth 4
`;
export async function sampleSystem(options,{details=false}={}){
 const s=settings(options), system=details||s.system, out={cpu:null,ram:null,totalMiB:null,freeMiB:null,diskFreeGiB:null,battery:null,ac:null,app:null,clipSeq:null,clipType:null,processes:[],partial:false};
 if(system){const a=cpuTotal();await delay(300);out.cpu=cpuPercent(a,cpuTotal());const total=os.totalmem(),free=os.freemem();out.ram=total>0?pct(100*(1-free/total)):null;out.totalMiB=Math.round(total/1048576);out.freeMiB=Math.round(free/1048576);try{const d=await fs.statfs(os.homedir());out.diskFreeGiB=Math.round(d.bavail*d.bsize/1073741824*10)/10;}catch{out.partial=true;}}
 if(process.platform!=='win32'){out.partial=true;return out;}
 if(!system&&!s.foreground&&!s.clipboard)return out;
 try{
  const script=WIN_SCRIPT.replace('__SYSTEM__',system?'$true':'$false').replace('__FOREGROUND__',s.foreground?'$true':'$false').replace('__CLIPBOARD__',s.clipboard?'$true':'$false').replace('__DETAILS__',details?'$true':'$false');
  const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const {stdout}=await run(exe,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,maxBuffer:65536,encoding:'utf8'});
  const q=JSON.parse(stdout.trim().replace(/^\uFEFF/,''));
  if(system){out.battery=pct(q.battery);out.ac=typeof q.ac==='boolean'?q.ac:null;}
  if(s.foreground)out.app=name(q.app);
  if(s.clipboard){out.clipSeq=Number.isSafeInteger(q.clipSeq)&&q.clipSeq>0?q.clipSeq:null;out.clipType=['files','image','text','other'].includes(q.clipType)?q.clipType:null;}
  if(details)out.processes=(Array.isArray(q.processes)?q.processes:[]).slice(0,5).map(p=>({name:name(p.name),ramMiB:num(p.ramMiB)})).filter(p=>p.name&&p.ramMiB!==null);
 }catch{out.partial=true;}
 return out;
}
export function createProactive({sample=sampleSystem,now=Date.now,allowed=()=>true,notify=()=>{},changed=()=>{}}={}){
 let s=settings(), latest=null,alerts=[],running=false,generation=0,seq=null,pressure={cpu:0,ram:0},lastGlobal=-Infinity,lastKind={};
 const snapshot=()=>({settings:{...s},latest:latest?structuredClone(latest):null,alerts:structuredClone(alerts),running});
 function configure(next){const n=settings(next);if(JSON.stringify(n)===JSON.stringify(s))return snapshot();s=n;generation++;latest=null;alerts=[];seq=null;pressure={cpu:0,ram:0};lastGlobal=-Infinity;lastKind={};return snapshot();}
 async function tick(manual=false){
  if(running||!allowed()||(!manual&&(!s.enabled||(!s.system&&!s.foreground&&!s.clipboard))))return false;
  const g=generation,opts={...s,foreground:s.enabled&&s.foreground,clipboard:s.enabled&&s.clipboard};running=true;changed();
  try{
   const q=await sample(opts,{details:manual});
   if(g!==generation||!allowed())return false;
   const {clipSeq,...visible}=q;latest={...visible,at:now()};const t=now(),candidates=[];
   if(!manual&&s.enabled){
    if(s.system){
     for(const k of ['cpu','ram']){pressure[k]=typeof q[k]==='number'&&q[k]>=90?pressure[k]+1:0;if(pressure[k]>=2)candidates.push({kind:k,text:(k==='cpu'?'CPU':'RAM')+' acima de 90% em duas amostras. Podes consultar o diagnóstico do ALEC.'});}
     if(q.ac===false&&q.battery!==null&&q.battery<=15)candidates.push({kind:'battery',text:'Bateria a '+q.battery+'%. Considera ligar o carregador.'});
    }
    if(s.clipboard&&clipSeq!==null){if(seq!==null&&seq!==clipSeq&&['text','image','files'].includes(q.clipType))candidates.push({kind:'clipboard',text:'Novo conteúdo no clipboard ('+({text:'texto',image:'imagem',files:'ficheiros'}[q.clipType])+'). Podes pedir ajuda ao ALEC.'});seq=clipSeq;}
    if(s.alerts){const a=candidates.find(x=>t-(lastKind[x.kind]??-Infinity)>=15*60000&&t-lastGlobal>=120000);if(a){lastGlobal=t;lastKind[a.kind]=t;alerts=[{...a,at:t},...alerts].slice(0,5);notify(a.text);}}
   }
   return true;
  }catch{return false;}finally{running=false;changed();}
 }
 return {configure,snapshot,tick,clear(){alerts=[];latest=null;seq=null;pressure={cpu:0,ram:0};generation++;changed();}};
}
