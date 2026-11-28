import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createNativeAgents} from './alec-native-agents.mjs';
import {createTrust} from './alec-trust.mjs';
const origin={kind:'desktop',id:'local',verified:true};
test('native developer panel stages, confirms exact proposal, revokes grants',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'alec-native-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'a.js'),'old');
 const trust=createTrust(),a=createNativeAgents({trust,origin});
 await a.handle({type:'alec_agents_open',kind:'developer',root});
 assert.equal(a.snapshot().error,'');const sessionId=a.snapshot().session.id;
 const stage=async(action,value)=>{await a.handle({type:'alec_agents_stage',sessionId,action,target:'a.js',value});assert.equal(a.snapshot().error,'');return a.snapshot().staged.id;};
 const confirm=id=>a.handle({type:'alec_agents_confirm',sessionId,id});
 let id=await stage('proposePatch','new');
 await confirm('invalid');assert.match(a.snapshot().error,/Proposal/);
 await confirm(id);assert.equal(a.snapshot().error,'');assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),'old');
 id=await stage('applyPatch');assert.equal(a.snapshot().staged.review.before,'old');assert.equal(a.snapshot().staged.review.after,'new');
 await confirm(id);assert.equal(a.snapshot().error,'');assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),'new');assert.equal(trust.list().length,0);
 await a.handle({type:'alec_agents_close'});assert.equal(a.snapshot().session,null);assert.equal(a.snapshot().result,null);
});
test('browser action grants are one-shot and scoped to authenticated local session',async()=>{
 const trust=createTrust(),events=[];
 const a=createNativeAgents({trust,origin,browserFactory:async scope=>({execute:async req=>{assert.equal(req.scope,scope);assert.equal(trust.list()[0].capability,'browser.read');events.push(req.step.action);return {text:'test'};},close:async()=>{}})});
 await a.handle({type:'alec_agents_open',kind:'browser',url:'https://example.com'});
 const sessionId=a.snapshot().session.id;
 await a.handle({type:'alec_agents_stage',sessionId,action:'navigate',target:'https://example.org/'});assert.ok(a.snapshot().error);assert.equal(events.length,0);
 await a.handle({type:'alec_agents_stage',sessionId,action:'navigate',target:'https://example.com/'});const id=a.snapshot().staged.id;
 await a.handle({type:'alec_agents_confirm',sessionId,id});assert.deepEqual(events,['navigate']);assert.equal(trust.list().length,0);
 await a.handle({type:'alec_agents_confirm',sessionId,id});assert.equal(events.length,1);
 await a.handle({type:'alec_agents_close'});assert.equal(a.snapshot().session,null);
});

test('model plans are imported only, bound to session scope and individually reviewed',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'alec-plan-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'a.js'),'one');
 const trust=createTrust(),a=createNativeAgents({trust,origin});
 await a.handle({type:'alec_agents_open',kind:'developer',root});
 const sessionId=a.snapshot().session.id;
 const imp=steps=>a.handle({type:'alec_agents_import_plan',sessionId,value:JSON.stringify({kind:'developer',scope:'ignored',steps})});
 await imp([{action:'read',target:'../outside'}]);assert.ok(a.snapshot().error);assert.equal(a.snapshot().plan,null);
 await imp([{action:'read',target:'a.js',value:'hidden'}]);assert.ok(a.snapshot().error);
 await imp([{action:'proposePatch',target:'a.js'},{action:'applyPatch',target:'a.js'}]);
 assert.equal(a.snapshot().plan.index,0);assert.equal(a.snapshot().staged,null);assert.equal(trust.list().length,0);
 await a.handle({type:'alec_agents_stage_plan',sessionId,value:'two'});
 const first=a.snapshot().staged.id;assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),'one');
 await a.handle({type:'alec_agents_confirm',sessionId,id:first});assert.equal(a.snapshot().plan.index,1);
 await a.handle({type:'alec_agents_stage_plan',sessionId});
 assert.equal(a.snapshot().staged.review.after,'two');assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),'one');
 await a.handle({type:'alec_agents_confirm',sessionId,id:a.snapshot().staged.id});
 assert.equal(a.snapshot().plan.index,2);assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),'two');assert.equal(trust.list().length,0);
 await a.handle({type:'alec_agents_close'});
});

test('Live bridge stages real developer actions but cannot confirm or write without native panel approval',async t=>{
 const {createLiveAgentBridge}=await import('../live/transport.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'alec-live-agent-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'a.js'),'old');
 const a=createNativeAgents({trust:createTrust(),origin});let review=0;const bridge=createLiveAgentBridge({agents:a,openReview:()=>review++});
 const opened=await bridge.open({kind:'developer',root});const sessionId=opened.session.id;
 const first=await bridge.stage({sessionId,action:'proposePatch',target:'a.js',value:'new'});assert.equal(first.state,'awaiting_local_review');assert.equal(review,1);assert.equal(bridge.confirm,undefined);assert.equal(bridge.status().result,null);
 await a.handle({type:'alec_agents_confirm',sessionId,id:first.staged.id});assert.equal(bridge.status().lastOperation.state,'complete');assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),'old');
 const second=await bridge.stage({sessionId,action:'applyPatch',target:'a.js'});assert.equal(bridge.status().result,null);assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),'old');
 await a.handle({type:'alec_agents_confirm',sessionId,id:second.staged.id});assert.equal(bridge.status().lastOperation.state,'complete');assert.equal(await fs.readFile(path.join(root,'a.js'),'utf8'),'new');await bridge.close();
});
