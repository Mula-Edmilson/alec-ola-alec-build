import test from 'node:test';
import assert from 'node:assert/strict';
import {createProactive,settings,cpuPercent,sampleSystem,diagnosticTimeout,diagnosticFailure,diagnosticScript,queryWindows} from './alec-proactive.mjs';
const q={cpu:95,ram:93,totalMiB:8192,freeMiB:500,diskFreeGiB:20,battery:12,ac:false,app:'Code',clipSeq:1,clipType:'text',processes:[],partial:false};
test('default disabled, manual read-only sample and no clipboard without consent',async()=>{let calls=0;const e=createProactive({sample:async(s,o)=>{calls++;assert.equal(s.clipboard,false);assert.equal(s.foreground,false);assert.equal(o.details,true);return q;}});assert.equal(await e.tick(),false);assert.equal(calls,0);assert.equal(await e.tick(true),true);assert.equal(calls,1);assert.equal(e.snapshot().alerts.length,0);assert.equal(Object.hasOwn(e.snapshot().latest,'clipSeq'),false);});
test('two samples, global and per-kind cooldown, no repeated alerts',async()=>{let t=0,notes=[];const e=createProactive({now:()=>t,sample:async()=>({...q,battery:null,ac:null}),notify:x=>notes.push(x)});e.configure({enabled:true,system:true,alerts:true});await e.tick();assert.equal(notes.length,0);t+=60000;await e.tick();assert.equal(notes.length,1);t+=60000;await e.tick();assert.equal(notes.length,1);t+=60000;await e.tick();assert.equal(notes.length,2);assert.ok(e.snapshot().alerts.length<=5);});
test('clipboard sequence only; no alert for initial observation, no repeated alert',async()=>{let seq=5,t=0,notes=[];const e=createProactive({now:()=>t,sample:async()=>({...q,clipSeq:seq}),notify:x=>notes.push(x)});e.configure({enabled:true,system:false,clipboard:true,alerts:true});await e.tick();assert.equal(notes.length,0);seq++;t+=60000;await e.tick();assert.equal(notes.length,1);t+=900000;await e.tick();assert.equal(notes.length,1);});
test('busy gate and discard result after revoking consent',async()=>{let ok=false,resolve,calls=0;const e=createProactive({allowed:()=>ok,sample:()=>{calls++;return new Promise(r=>resolve=r);}});e.configure({enabled:true});assert.equal(await e.tick(),false);ok=true;const task=e.tick();assert.equal(await e.tick(),false);e.configure({enabled:false});resolve(q);assert.equal(await task,false);assert.equal(calls,1);assert.equal(e.snapshot().latest,null);});
test('strict booleans and valid CPU delta',()=>{assert.equal(settings({enabled:'true'}).enabled,false);assert.equal(cpuPercent({idle:100,total:200},{idle:120,total:300}),80);assert.equal(cpuPercent({idle:1,total:1},{idle:1,total:1}),null);});
test('real read-only diagnostic sample on runner',async()=>{const r=await sampleSystem({system:true,foreground:false,clipboard:false},{details:true});assert.ok(r.totalMiB>0);assert.ok(r.ram>=0&&r.ram<=100);assert.equal(r.app,null);assert.equal(r.clipSeq,null);if(process.platform==='win32'){assert.equal(r.partial,false,'Windows diagnostic provider must succeed: '+(r.providerIssue||r.diskIssue||'unknown'));assert.ok(r.processes.length>0);}});

test('manual inventory has a bounded cold-start allowance; background limit unchanged',()=>{assert.equal(diagnosticTimeout(false),10000);assert.equal(diagnosticTimeout(true),25000);assert.equal(diagnosticFailure({killed:true}),'timeout');assert.equal(diagnosticFailure(new SyntaxError('private data')),'invalid_json');assert.equal(diagnosticFailure(new Error('private path')),'provider_error');});

test('normal system inventory never starts the C# compiler or captures private context',()=>{
 const s=diagnosticScript({system:true,foreground:false,clipboard:false},{details:true});
 assert.ok(!s.includes('Add-Type -TypeDefinition'));
 assert.ok(!s.includes('DllImport'));
 assert.ok(s.includes('System.Windows.Forms.SystemInformation'));
 assert.ok(s.includes('Get-Process | Sort-Object WorkingSet64'));
 assert.ok(!s.includes('GetClipboardData'));
 assert.ok(s.includes('if ($false)'));
 const optional=diagnosticScript({system:false,foreground:true,clipboard:false});
 assert.ok(optional.includes('Add-Type -TypeDefinition'));
 assert.ok(!optional.includes('GetClipboardData'));
});
test('manual timeout retries once, background and non-timeout errors never retry',async()=>{
 const script=diagnosticScript({system:true},{details:true});let calls=0;
 const q=await queryWindows(script,{details:true,exe:'fixed-powershell',execute:async(exe,args,opts)=>{
   assert.equal(exe,'fixed-powershell');assert.equal(opts.timeout,25000);
   assert.equal(Buffer.from(args.at(-1),'base64').toString('utf16le'),script);
   if(++calls===1)throw Object.assign(new Error('timeout'),{killed:true});
   return {stdout:'{"processes":[]}'};
 }});
 assert.equal(calls,2);assert.deepEqual(q,{processes:[]});
 for(const [details,killed,max] of [[false,true,1],[true,false,1],[true,true,2]]){
  calls=0;await assert.rejects(queryWindows(script,{details,execute:async()=>{calls++;throw Object.assign(new Error('error'),{killed});}}));assert.equal(calls,max);
 }
 await assert.rejects(queryWindows(script,{execute:async()=>({stdout:'{"unexpected":true}'})}),SyntaxError);
});

test('second real Windows inventory succeeds after the first, with no context permission',async()=>{if(process.platform!=='win32')return;const r=await sampleSystem({system:true,foreground:false,clipboard:false},{details:true});assert.equal(r.partial,false,'Repeated Windows diagnostic failed: '+(r.providerIssue||r.diskIssue||'unknown'));assert.ok(r.processes.length>0);assert.equal(r.app,null);assert.equal(r.clipSeq,null);});
