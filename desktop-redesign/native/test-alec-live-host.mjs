import test from 'node:test';
import assert from 'node:assert/strict';
import {startLiveHost} from './alec-live-host.mjs';
const assets={'/':'<html>Live</html>','/client.js':'','/capture.js':''};
test('loopback gateway authorizes one explicit session; protects audio and releases lock',async()=>{
 let calls=0,frames=0,ended=0,closeFn;
 const h=await startLiveHost({assets,onEnd:()=>ended++,connect:({emit,onClose})=>{calls++;closeFn=onClose;queueMicrotask(()=>emit({type:'ready'}));return {audio:b=>{frames++;return b.length===2;},close:()=>onClose()};}});
 const u=new URL(h.url),origin=u.origin,headers={'x-alec-token':u.hash.slice(1),origin};
 try{
 assert.equal((await fetch(origin+'/session',{method:'POST'})).status,403);
 assert.equal((await fetch(origin+'/session',{method:'POST',headers:{...headers,origin:'https://bad.invalid'}})).status,403);
 assert.equal(calls,0);
 const s=await fetch(origin+'/session',{method:'POST',headers});assert.equal(s.status,200);
 const reader=s.body.getReader();const first=await reader.read();assert.match(Buffer.from(first.value).toString(),/"ready"/);
 assert.equal((await fetch(origin+'/session',{method:'POST',headers})).status,409);
 assert.equal((await fetch(origin+'/audio',{method:'POST',headers,body:Buffer.alloc(6402)})).status,413);assert.equal(frames,0);
 assert.equal((await fetch(origin+'/audio',{method:'POST',headers,body:Buffer.alloc(2)})).status,204);assert.equal(frames,1);
 h.close();assert.equal(ended,1);closeFn();assert.equal(ended,1);
 }finally{h.close();}
});
test('no browser connection releases native mode lock at deadline',async()=>{
 let end;const promise=new Promise(r=>end=r);
 const h=await startLiveHost({assets,connect:()=>{throw Error('unexpected');},onEnd:end,startMs:50});
 try{assert.equal(await promise,'start_timeout');}finally{h.close();}
});
