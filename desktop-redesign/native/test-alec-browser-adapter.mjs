import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {createBrowserAdapter} from './alec-browser-adapter.mjs';
import {createAgentCoordinator} from './alec-agent-plans.mjs';
test('real isolated Chromium: read, fill, reviewed submit, reject cross-origin and redirects', {timeout:60000},async t=>{
 const key=await fs.readFile(process.env.ALEC_FIXTURE_KEY),cert=await fs.readFile(process.env.ALEC_FIXTURE_CERT);
 let externalHits=0,submissions=[];
 const external=https.createServer({key,cert},(_,res)=>{externalHits++;res.end('outside');});
 await new Promise(r=>external.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>external.close(r)));
 const outside='https://127.0.0.1:'+external.address().port;
 const server=https.createServer({key,cert},(req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/redirect'){res.writeHead(302,{Location:outside});return res.end();}
  if(req.url==='/done'&&req.method==='POST'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{submissions.push(body);res.end('<h1>Done</h1>');});return;}
  res.end('<h1>Fixture</h1><form method="post" action="/done"><input name="q" placeholder="Search"><button type="submit">Send</button></form><a href="/redirect">Redirect</a><img src="'+outside+'/img"><script>fetch("'+outside+'/script")</script>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const scope='https://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,chromiumSandbox:true});t.after(()=>browser.close());
 // Self-signed certificate accepted ONLY in the fixture; production adapter never bypasses TLS.
 const adapter=await createBrowserAdapter({browser:{newContext:opts=>browser.newContext({...opts,ignoreHTTPSErrors:true})},scope});
 t.after(()=>adapter.close());
 let last,payload={};
 const c=createAgentCoordinator({authorize:req=>req.scope===scope,execute:async req=>{last=await adapter.execute(req,payload);}});
 const local={kind:'desktop',verified:true,approvedBy:'local-user'};
 const run=async (step,p={})=>{payload=p;const task=c.prepare({kind:'browser',scope,steps:[step]});if(task.plan.steps[0].requiresApproval)c.approveStep(task.id,0,local);await c.next(task.id);return last;};
 let page=await run({action:'navigate',target:scope});
 assert.match(page.text,/Fixture/);
 const input=page.elements.find(x=>x.tag==='input');assert.ok(input);
 page=await run({action:'fill',target:input.id},{value:'alec'});
 const submit=page.elements.find(x=>x.type==='submit');assert.ok(submit);
 const task=c.prepare({kind:'browser',scope,steps:[{action:'submit',target:submit.id}]});
 await assert.rejects(c.next(task.id),/approval/);
 assert.equal(submissions.length,0);
 c.approveStep(task.id,0,local);await c.next(task.id);
 assert.deepEqual(submissions,['q=alec']);assert.match(last.text,/Done/);
 assert.throws(()=>c.prepare({kind:'browser',scope,steps:[{action:'navigate',target:outside}]}));
 await assert.rejects(run({action:'navigate',target:scope+'/redirect'}));
 assert.equal(externalHits,0);
});
