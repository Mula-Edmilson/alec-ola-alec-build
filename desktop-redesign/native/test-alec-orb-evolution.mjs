import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const window={};
vm.runInNewContext(fs.readFileSync(new URL('./alec-orb-evolution.js',import.meta.url),'utf8'),{window});
const orb=window.Roamie.alecOrb;
function capture(mode,t,level,reduced=false,R=40){
 const ops=[];let depth=0;
 const record=(n)=>(...args)=>{assert.ok(args.every(x=>typeof x!=='number'||Number.isFinite(x)));ops.push([n,...args]);};
 const ctx={save(){depth++;},restore(){depth--;},createRadialGradient(...a){record('gradient')(...a);return {addColorStop:record('stop')};}};
 for(const key of ['beginPath','arc','clip','fillRect','moveTo','lineTo','stroke','fill'])ctx[key]=record(key);
 const proxy=new Proxy(ctx,{set(o,k,v){if(k==='fillStyle'||k==='strokeStyle')ops.push([k,typeof v==='string'?v:'gradient']);o[k]=v;return true;}});
 orb.paint(proxy,60,60,R,{mode,t,level,reduced});
 assert.equal(depth,0);assert.ok(ops.length>50);
 assert.ok(!ops.some(o=>o[0]==='fillStyle'&&(/^(#000|black)$/i.test(o[1]))));
 return JSON.stringify(ops);
}
test('new shared renderer, transparent clipped footprint and balanced Canvas state',()=>{
 assert.equal(orb.revision,'ALEC_ORB_EVOLUTION_V1');
 for(const mode of ['idle','listen','talk','think','execute','error','constructor'])capture(mode,1,.5);
});
test('motion, real input level, reduced motion and compact radius',()=>{
 assert.notEqual(capture('idle',0,0),capture('idle',2,0));
 assert.notEqual(capture('talk',0,0),capture('talk',0,1));
 assert.equal(capture('idle',0,0,true),capture('idle',2,0,true));
 capture('idle',0,0,false,20);
});
