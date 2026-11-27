import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDeveloperAdapter} from './alec-developer-adapter.mjs';
import {createAgentCoordinator} from './alec-agent-plans.mjs';
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'alec-dev-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'src'));
 await fs.writeFile(path.join(root,'src','index.mjs'),'export const x=1;\n');
 await fs.writeFile(path.join(root,'src','.env'),'secret');
 await fs.writeFile(path.join(root,'src','unit.test.mjs'),"import test from 'node:test';test('fixture',()=>{});");
 return {root,adapter:await createDeveloperAdapter({root,scope:'demo',tests:{unit:'src/unit.test.mjs'}})};
}
const request=(action,target)=>({kind:'developer',scope:'demo',step:{action,target},signal:new AbortController().signal});
test('real local list/read, explicit proposal and reviewed replacement',async t=>{
 const {root,adapter}=await fixture(t);
 const list=await adapter.execute(request('list','src'));assert.equal(list.some(x=>x.name==='.env'),false);
 const read=await adapter.execute(request('read','src/index.mjs'));assert.match(read.text,/x=1/);
 const p=await adapter.execute(request('proposePatch','src/index.mjs'),{replacement:'export const x=2;\n'});
 assert.equal(await fs.readFile(path.join(root,'src','index.mjs'),'utf8'),p.before);
 await assert.rejects(adapter.execute(request('applyPatch','src/index.mjs'),{proposalId:'wrong'}));
 let result;
 const c=createAgentCoordinator({authorize:()=>true,execute:async req=>{result=await adapter.execute(req,{proposalId:p.id});}});
 const task=c.prepare({kind:'developer',scope:'demo',steps:[{action:'applyPatch',target:'src/index.mjs'}]});
 await assert.rejects(c.next(task.id),/approval/);
 c.approveStep(task.id,0,{kind:'desktop',verified:true,approvedBy:'local-user'});await c.next(task.id);
 assert.equal(result.changed,true);assert.match(await fs.readFile(path.join(root,'src','index.mjs'),'utf8'),/x=2/);
 await assert.rejects(adapter.execute(request('applyPatch','src/index.mjs'),{proposalId:p.id}));
});
test('reject traversal, secrets, stale edits and wrong workspace',async t=>{
 const {root,adapter}=await fixture(t);
 for(const p of ['../secret','src/.env','C:/temp'])await assert.rejects(adapter.execute(request('read',p)));
 await assert.rejects(adapter.execute({...request('read','src/index.mjs'),scope:'other'}));
 const p=await adapter.execute(request('proposePatch','src/index.mjs'),{replacement:'new'});
 await fs.writeFile(path.join(root,'src','index.mjs'),'external change');
 await assert.rejects(adapter.execute(request('applyPatch','src/index.mjs'),{proposalId:p.id}),/changed/);
 assert.equal(await fs.readFile(path.join(root,'src','index.mjs'),'utf8'),'external change');
 await fs.mkdir(path.join(root,'outside'));
 await fs.symlink(path.join(root,'outside'),path.join(root,'src','junction'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(adapter.execute(request('list','src/junction')),/Links/);
});
test('execute registered real Node test, no arbitrary commands',async t=>{
 const {adapter}=await fixture(t);
 await assert.rejects(adapter.execute(request('runTest','unknown')));
 const result=await adapter.execute(request('runTest','unit'));assert.equal(result.code,0);
});
