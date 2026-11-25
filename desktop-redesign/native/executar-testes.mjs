// Run every upstream test in its own temporary HOME and fail if any test fails.
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
const failed=[];
for(const file of order){
 const home=mkdtempSync(path.join(os.tmpdir(),'alec-ci-test-'));
 try{
  console.log('\n=== TEST '+file+' ===');
  const env={...process.env,HOME:home,USERPROFILE:home};
  delete env.ROAMIES_DATA_DIR;
  const result=spawnSync(process.execPath,[path.join(dir,file)],{stdio:'inherit',env,timeout:120000});
  if(result.status!==0){failed.push({file,status:result.status,signal:result.signal,error:result.error?.message});}
 }finally{rmSync(home,{recursive:true,force:true});}
}
console.log(JSON.stringify({total:all.length,failed},null,2));
if(failed.length)process.exitCode=1;
