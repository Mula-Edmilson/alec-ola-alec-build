// Verify real installed WebView2 content through CI-only DevTools.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
const dest=path.resolve(process.argv[2]||'candidate/ALEC-installed-dashboard.png');
const port=Number(process.env.ALEC_TEST_CDP_PORT||9222);
let target;
for(let i=0;i<90;i++){
 try{
  const list=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(2000)})).json();
  target=list.find(p=>p.type==='page'&&/\/panel\/index\.html(?:[?#]|$)/.test(p.url)&&p.webSocketDebuggerUrl);
  if(target)break;
 }catch{}
 await sleep(1000);
}
assert.ok(target,'Installed dashboard WebView2 target unavailable');
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('DevTools open timeout')),10000);
 ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
 ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('DevTools open failed'));},{once:true});
});
let next=0;const pending=new Map();
ws.addEventListener('message',e=>{
 try{const msg=JSON.parse(e.data);const p=pending.get(msg.id);if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}}catch{}
});
function call(method,params={}){
 const id=++next;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},15000);
  pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
 });
}
const expression="(function inspectDashboard(){\n const c=document.getElementById('alec-main-orb'),status=document.getElementById('alec-orb-status');\n if(!c||!status||!window.__TAURI__?.core?.invoke)return {ready:false,title:document.title};\n const r=c.getBoundingClientRect(),ctx=c.getContext('2d');\n if(r.width<130||r.height<130||!ctx)return {ready:false,width:r.width,height:r.height};\n const data=ctx.getImageData(0,0,c.width,c.height).data;let lit=0,blue=0;\n for(let i=0;i<data.length;i+=4){if(data[i+3]>100)lit++;if(data[i+3]>100&&data[i+2]>data[i]+15)blue++;}\n return {ready:true,title:document.title,revision:window.Roamie?.alecOrb?.revision,width:r.width,height:r.height,lit,blue,status:status.textContent,compose:!!document.getElementById('alec-ask-launch'),noHomeInput:!document.querySelector('#pane-home input[type=text],#pane-home textarea,.alec-compose'),listen:!!document.getElementById('alec-orb-listen'),tabs:[...document.querySelectorAll('.nav [data-page]')].filter(b=>b.getBoundingClientRect().width>0).length,windowWidth:innerWidth,windowHeight:innerHeight,visible:getComputedStyle(document.getElementById('frame')).opacity};\n})()";

try{
 await call('Runtime.enable');await call('Page.enable');
 let report=null;
 for(let i=0;i<45;i++){
  const r=await call('Runtime.evaluate',{expression,returnByValue:true});
  report=r.result?.value;
  if(report?.ready&&report.revision==='ALEC_ORB_NATIVE_V6'&&report.lit>100&&report.blue>50&&report.visible==='1')break;
  await sleep(1000);
 }
 console.log(JSON.stringify(report,null,2));
 assert.ok(report?.ready&&report.revision==='ALEC_ORB_NATIVE_V6','Wrong or absent native renderer');
 assert.ok(report.lit>100&&report.blue>50&&report.visible==='1','Installed orb did not render visibly');
 assert.ok(report.compose&&report.noHomeInput&&report.listen&&report.tabs===8&&report.windowWidth<=400&&report.windowHeight<=490,'Dashboard controls or tabs missing');
 const screenshot=await call('Page.captureScreenshot',{format:'png',fromSurface:true});
 const png=Buffer.from(screenshot.data,'base64');
 assert.ok(png.length>8000&&png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Actual screenshot unavailable');
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,png);fs.writeFileSync(path.join(path.dirname(dest),'ALEC-visual-check.json'),JSON.stringify(report,null,2));
 console.log('Installed ALEC dashboard visual check passed');
}finally{ws.close();}
