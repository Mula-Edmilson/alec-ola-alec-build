import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePlan,createAgentCoordinator} from './alec-agent-plans.mjs';
const browser={kind:'browser',scope:'https://example.com',steps:[{action:'navigate',target:'https://example.com/a'},{action:'submit',target:'form1'}]};
const dev={kind:'developer',scope:'project-1',steps:[{action:'read',target:'src/main.js'},{action:'runTest',target:'unit'}]};
const local={kind:'desktop',verified:true,approvedBy:'local-user'};
test('restrict origins, paths and action vocabulary',()=>{
 assert.throws(()=>normalizePlan({...browser,steps:[{action:'navigate',target:'https://evil.example/a'}]}));
 assert.throws(()=>normalizePlan({...browser,steps:[{action:'evaluate',target:'x'}]}));
 for(const target of ['../secret','C:/secret','a\\b','.env.local','a/.git/config','a//b','a/CON.txt','a/x.'])assert.throws(()=>normalizePlan({...dev,steps:[{action:'read',target}]}));
 assert.throws(()=>normalizePlan({...dev,steps:[{action:'runTest',target:'npm test && x'}]}));
 assert.equal(normalizePlan(dev).steps[1].requiresApproval,true);
 assert.equal(Object.isFrozen(normalizePlan(dev).steps),true);
});
test('single task, verified approval, expiry, and one-shot authorization',async()=>{
 let time=0,calls=0;
 const c=createAgentCoordinator({clock:()=>time,authorize:async()=>true,execute:async()=>{calls++;}});
 const p=c.prepare(browser);
 assert.throws(()=>c.prepare(dev));
 await c.next(p.id);
 await assert.rejects(c.next(p.id),/approval/);
 assert.throws(()=>c.approveStep(p.id,1,{...local,kind:'remote'}));
 c.approveStep(p.id,1,local);time=60000;
 await assert.rejects(c.next(p.id),/approval/);
 c.approveStep(p.id,1,local);assert.equal((await c.next(p.id)).state,'complete');
 assert.equal(calls,2);await assert.rejects(c.next(p.id));
});
test('authorization failure never executes',async()=>{
 const c=createAgentCoordinator({authorize:()=>false,execute:()=>assert.fail('executed')});
 const p=c.prepare(dev);await assert.rejects(c.next(p.id),/denied/);assert.equal(c.snapshot().state,'failed');
});
test('cancel in flight prevents further execution and overlapping task',async()=>{
 let release;
 const c=createAgentCoordinator({authorize:()=>true,execute:()=>new Promise(r=>{release=r;})});
 const p=c.prepare(browser);const run=c.next(p.id);await Promise.resolve();
 assert.equal(c.cancel(p.id),true);assert.throws(()=>c.prepare(dev));release();
 assert.equal((await run).state,'cancelled');assert.equal(c.prepare(dev).state,'review');
});
