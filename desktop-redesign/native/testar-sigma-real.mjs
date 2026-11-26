// Run only on a disposable Windows runner with no existing Sigma instance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {approveSigmaSettings,createSigmaSupervisor} from './alec-sigma-supervisor.mjs';
import {createSigmaVision} from './alec-sigma-vision.mjs';
if(process.platform!=='win32')throw Error('Windows required');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'sigma-live-'));
let child;
try{
 const approved=path.join(root,'allowed'),denied=path.join(root,'denied');
 await fs.mkdir(approved);await fs.mkdir(denied);
 await fs.writeFile(path.join(approved,'sample.txt'),'sample');
 await fs.writeFile(path.join(denied,'private.txt'),'not returned');
 const settings=await approveSigmaSettings({exe:path.resolve(process.argv[2]),roots:[approved],monitor:false},()=>true);
 const supervisor=createSigmaSupervisor({settings:()=>settings,enabled:()=>true,checkRoot:()=>true,folder:path.join(root,'credential'),launch:(...args)=>(child=spawn(...args))});
 const vision=createSigmaVision({enabled:()=>true,remote:()=>false,checkPath:p=>supervisor.allows(p),configured:supervisor.configured,getToken:supervisor.getToken,ensureReady:supervisor.ensure});
 const status=await vision.status();assert.equal(status.state,'connected');
 const result=await vision.list(approved);assert.ok(result.items.some(x=>x.name==='sample.txt'));
 await assert.rejects(vision.list(denied),/não autorizado/);
 const url='http://127.0.0.1:47821/v1/files',body=JSON.stringify({operation:'list',path:denied,limit:5});
 const unauth=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body});assert.equal(unauth.status,401);
 const forbidden=await fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+supervisor.getToken()},body});assert.equal(forbidden.status,403);
 const encrypted=await fs.readFile(path.join(root,'credential','sigma-token.dpapi'),'utf8');assert.ok(!encrypted.includes(supervisor.getToken()));
 supervisor.reset();console.log('LIVE SIGMA: DPAPI, native start, authenticated status, list, denied scope and no-auth verified.');
}finally{
 if(child&&child.exitCode===null){child.kill();await new Promise(r=>{child.once('exit',r);setTimeout(r,3000);});}
 await fs.rm(root,{recursive:true,force:true}).catch(()=>{});
}
