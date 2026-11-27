// Developer adapter: explicit workspace, reviewed replacements and registered Node tests.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {normalizePlan} from './alec-agent-plans.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const MAX=256*1024;
const inside=(root,p)=>{const rel=path.relative(root,p);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
const protectedName=s=>/^(?:\.git|\.env(?:\..*)?|\.ssh|\.npmrc|node_modules|\.aws|\.gnupg|credentials(?:\..*)?|secrets?(?:\..*)?)$/i.test(s)||/\.(?:pem|key|pfx|p12|kdbx)$/i.test(s);
export async function createDeveloperAdapter({root,scope,tests={}}){
 const canonical=await fs.realpath(root);
 if(!(await fs.stat(canonical)).isDirectory()||canonical===path.parse(canonical).root)throw Error('Select a project directory, not a drive root');
 const registered=new Map(Object.entries(tests));
 const proposed=new Map();
 function check(action,target){return normalizePlan({kind:'developer',scope,steps:[{action,target}]}).steps[0];}
 async function resolve(target,action){
  check(action,target);
  const parts=target.split('/');
  if(parts.some(protectedName))throw Error('Protected path');
  if(await fs.realpath(canonical)!==canonical)throw Error('Workspace changed');
  let current=canonical;
  for(const part of parts){
   current=path.join(current,part);
   const st=await fs.lstat(current);
   if(st.isSymbolicLink())throw Error('Links and junctions are not permitted');
   const real=await fs.realpath(current);
   if(!inside(canonical,real)||path.relative(current,real)!=='')throw Error('Path escaped workspace');
  }
  return current;
 }
 async function read(target){
  const p=await resolve(target,'read');
  const st=await fs.stat(p);
  if(!st.isFile()||st.size>MAX||st.nlink!==1)throw Error('Unsupported file');
  const b=await fs.readFile(p);
  if(b.length>MAX||b.includes(0))throw Error('Unsupported text file');
  const value=new TextDecoder('utf-8',{fatal:true}).decode(b);
  return {text:value,sha256:digest(b)};
 }
 async function propose(target,replacement){
  if(typeof replacement!=='string'||Buffer.byteLength(replacement)>MAX||replacement.includes('\0'))throw Error('Invalid replacement');
  const before=await read(target);
  if(proposed.size>=20&&!proposed.has(target))throw Error('Proposal limit');
  const item=Object.freeze({id:randomUUID(),target,before:before.text,after:replacement,sha256:before.sha256});
  proposed.set(target,item);return item;
 }
 async function apply(target,proposalId,signal){
  const item=proposed.get(target);
  if(!item||item.id!==proposalId)throw Error('Exact reviewed proposal required');
  proposed.delete(target);
  const p=await resolve(target,'applyPatch');
  if((await read(target)).sha256!==item.sha256)throw Error('File changed since review');
  const mode=(await fs.stat(p)).mode;
  const tmp=path.join(path.dirname(p),'.alec-'+randomUUID()+'.tmp');
  try{
   await fs.writeFile(tmp,item.after,{encoding:'utf8',flag:'wx',mode:mode&0o777});
   if(signal?.aborted)throw Error('Cancelled');
   if(await resolve(target,'applyPatch')!==p||(await read(target)).sha256!==item.sha256)throw Error('File changed during review');
   await fs.rename(tmp,p);
   return {target,sha256:digest(Buffer.from(item.after)),changed:true};
  }finally{await fs.rm(tmp,{force:true}).catch(()=>{});}
 }
 async function runTest(id,signal){
  check('runTest',id);
  const target=registered.get(id);
  if(!target||!/\.(?:mjs|cjs|js)$/.test(target))throw Error('Unknown registered Node test');
  const p=await resolve(target,'read');
  if(!(await fs.stat(p)).isFile()||signal?.aborted)throw Error('Test unavailable');
  return await new Promise((resolve,reject)=>{
   // No shell, no arbitrary command arguments, no API credentials inherited.
   const env={};
   for(const k of ['SystemRoot','WINDIR','PATH','TEMP','TMP','TMPDIR','LANG'])if(process.env[k])env[k]=process.env[k];
   const child=spawn(process.execPath,['--test',p],{cwd:canonical,env,shell:false,windowsHide:true});
   let output='',done=false;
   const finish=(err,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);err?reject(err):resolve(result);};
   const abort=()=>{child.kill();};
   const timer=setTimeout(abort,30000);
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   const add=b=>{output=(output+b.toString()).slice(-32768);};
   child.stdout.on('data',add);child.stderr.on('data',add);
   child.on('error',e=>finish(e));
   child.on('close',(code,termination)=>{if(signal?.aborted)return finish(Error('Cancelled'));finish(null,{code,termination,output});});
  });
 }
 async function execute({kind,scope:requested,step,signal},payload={}){
  if(kind!=='developer'||requested!==scope||signal?.aborted)throw Error('Invalid developer request');
  const {action,target}=check(step.action,step.target);
  if(action==='read')return read(target);
  if(action==='list'){
   const p=await resolve(target,'list');
   const entries=await fs.readdir(p,{withFileTypes:true});
   return entries.filter(e=>!e.isSymbolicLink()&&!protectedName(e.name)).slice(0,200).map(e=>({name:e.name,directory:e.isDirectory()}));
  }
  if(action==='proposePatch')return propose(target,payload.replacement);
  if(action==='applyPatch')return apply(target,payload.proposalId,signal);
  if(action==='runTest')return runTest(target,signal);
  throw Error('Unsupported action');
 }
 return Object.freeze({execute});
}
