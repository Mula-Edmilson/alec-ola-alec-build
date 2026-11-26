import test from 'node:test';
import assert from 'node:assert/strict';
import {createSigmaClient,createSigmaVision,SIGMA_TOOL_NAMES} from './alec-sigma-vision.mjs';
const token='a'.repeat(64);
const reply=data=>new Response(JSON.stringify({provider:'sigma',data}));
const setup=(handler,overrides={})=>{
  let enabled=true,remote=false,requests=0;
  const vision=createSigmaVision({enabled:()=>enabled,remote:()=>remote,checkPath:p=>p.startsWith('E:\\Test\\')&&!p.includes('secret'),getToken:()=>token,fetchImpl:async(url,opts)=>{requests++;assert.equal(url,'http://127.0.0.1:47821/v1/files');assert.equal(opts.redirect,'error');assert.equal(opts.headers.authorization,'Bearer '+token);return handler(JSON.parse(opts.body));},...overrides});
  return {vision,disable:()=>{enabled=false;},remote:()=>{remote=true;},requests:()=>requests};
};
test('uses Sigma and filters denied results',async()=>{const {vision}=setup(req=>{assert.deepEqual(req,{operation:'search',query:'test',limit:3});return reply({items:[{name:'test',path:'E:\\Test\\test',size:4},{path:'C:\\Windows\\x'},{path:'E:\\Test\\secret'}]});});const d=await vision.search('test',3);assert.equal(d.items.length,1);assert.equal(d.exhaustive,false);});
test('denied directory never sent',async()=>{const s=setup(()=>{throw Error('unexpected')});await assert.rejects(s.vision.list('C:\\Windows'),/não autorizado/);assert.equal(s.requests(),0);});
test('disabled and remote cannot call service',async()=>{const a=setup(()=>reply({}));a.disable();await assert.rejects(a.vision.status(),/não autorizado/);const b=setup(()=>reply({}));b.remote();await assert.rejects(b.vision.search('x'),/não autorizado/);assert.equal(a.requests()+b.requests(),0);});
test('revocation during request suppresses results',async()=>{let s;s=setup(()=>{s.disable();return reply({items:[{path:'E:\\Test\\x'}]});});await assert.rejects(s.vision.search('x'),/não autorizado/);});
test('invalid credential fails closed',async()=>{const s=setup(()=>reply({}),{getToken:()=>''});assert.equal(s.vision.available(),false);await assert.rejects(s.vision.status(),/não autorizado/);assert.equal(s.requests(),0);});
test('real status only, no secrets in snapshot',async()=>{const {vision}=setup(()=>reply({indexReady:true,scanning:false}));assert.equal(vision.snapshot().state,'untested');await vision.status();assert.equal(vision.snapshot().indexReady,true);assert.ok(!JSON.stringify(vision.snapshot()).includes(token));});
test('service error is generic',async()=>{const s=setup(()=>new Response(token,{status:403}));await assert.rejects(s.vision.status(),/403/);assert.equal(s.vision.snapshot().state,'unavailable');});
test('rejects bad response and excessive size',async()=>{const c=createSigmaClient({token,fetchImpl:async()=>new Response('x'.repeat(1048577))});await assert.rejects(c.status(),/demasiado grande/);const d=createSigmaClient({token,fetchImpl:async()=>new Response('{"provider":"other","data":{}}')});await assert.rejects(d.status(),/inválida/);});
test('validates search limit and exposes no write tool',async()=>{const c=createSigmaClient({token,fetchImpl:async()=>{throw Error('unexpected');}});assert.throws(()=>c.search('x',101));assert.throws(()=>c.search(''));assert.deepEqual([...SIGMA_TOOL_NAMES],['sigma_status','sigma_search','sigma_list']);});
