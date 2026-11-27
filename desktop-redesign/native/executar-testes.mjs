// Run every upstream test in a fresh temporary HOME; fail on persistent or unexpected errors.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=path.resolve(process.argv[2]||'upstream/showcase/tauri/sidecar/test');
const original=readFileSync(path.join(dir,'run.mjs'),'utf8');
const first=/const FIRST = \[([\s\S]*?)\];/.exec(original);
if(!first)throw Error('Original test ordering not found');
const names=[...first[1].matchAll(/'([^']+\.test\.mjs)'/g)].map(m=>m[1]);
const all=readdirSync(dir).filter(f=>f.endsWith('.test.mjs'));
const order=[...names.filter(f=>all.includes(f)),...all.filter(f=>!names.includes(f)).sort()];
if(order.length!==all.length||new Set(order).size!==all.length||!all.length)throw Error('Test inventory mismatch');
const failed=[],retried=[];
for(const file of order){
 for(let attempt=1;attempt<=3;attempt++){
  const home=mkdtempSync(path.join(os.tmpdir(),'alec-ci-test-'));
  let result;
  try{
   console.log('\n=== TEST '+file+' (attempt '+attempt+') ===');
   const env={...process.env,HOME:home,USERPROFILE:home};
   delete env.ROAMIES_DATA_DIR;
   result=spawnSync(process.execPath,[path.join(dir,file)],{encoding:'utf8',env,timeout:120000,maxBuffer:16*1024*1024});
   if(result.stdout)process.stdout.write(result.stdout);
   if(result.stderr)process.stderr.write(result.stderr);
  }finally{rmSync(home,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
  if(result.status===0&&!result.error&&!result.signal)break;
  // Only retry the observed transient Windows fixture lock; assertions, timeouts,
  // other file errors and all other tests remain hard failures.
  const transient=process.platform==='win32'&&file==='agents.test.mjs'&&result.status===1&&!result.error&&!result.signal&&
   /Error: EBUSY: resource busy or locked, open '[^\r\n]*roamies-agentmgr-[^\r\n]*[\\/]Desktop[\\/]card 2\.txt'/i.test(result.stderr||'')&&
   /agents\.test\.mjs:401:/.test(result.stderr||'')&&!/AssertionError/.test(result.stderr||'');
  if(transient&&attempt<3){
   retried.push({file,attempt,reason:'Windows EBUSY on disposable card 2.txt fixture'});
   console.warn('Retrying entire test in a fresh HOME after transient fixture lock; no assertions skipped.');
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500*attempt);
   continue;
  }
  failed.push({file,status:result.status,signal:result.signal,error:result.error?.message});break;
 }
}
console.log(JSON.stringify({total:all.length,retried,failed},null,2));
if(failed.length)process.exitCode=1;
