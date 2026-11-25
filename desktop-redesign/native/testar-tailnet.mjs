import assert from 'node:assert/strict';
import {detectTailnet,isTailnetIPv4} from './alec-bridge-supervisor.mjs';
const env={ProgramFiles:'C:/Program Files'},exists=()=>true,ip='100.101.22.33',active=()=>[ip];
const runState=(state,ips=[ip],online=true)=>async(exe,args,opts)=>{
  assert.ok(exe.endsWith('tailscale.exe'));assert.deepEqual(args,['status','--json']);assert.equal(opts.shell,false);
  return {stdout:JSON.stringify({BackendState:state,Self:{TailscaleIPs:ips,Online:online}})};
};
assert.equal(await detectTailnet({env,exists,active,run:runState('Running')}),ip);
for(const [state,ips,online] of [['Stopped',[ip],true],['Running',['192.168.1.2'],true],['Running',['100.101.22.34'],true],['Running',[ip],false]]){
 await assert.rejects(detectTailnet({env,exists,active,run:runState(state,ips,online)}),/sem ligação activa/);
}
await assert.rejects(detectTailnet({env,exists:()=>false,active,run:runState('Running')}),/não encontrado/);
await assert.rejects(detectTailnet({env,exists,active,run:async()=>{throw Error('timeout');}}),/sem ligação activa/);
for(const bad of ['100.63.1.2','100.128.1.2','100.64.1.256','127.0.0.1','1.2.3.4','::1'])assert.equal(isTailnetIPv4(bad),false);
for(const good of ['100.64.0.1','100.127.255.254'])assert.equal(isTailnetIPv4(good),true);
console.log('Tailnet detection: connected, offline, unavailable, timeout, spoofed IP and range checks passed.');
