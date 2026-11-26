import test from 'node:test';
import assert from 'node:assert/strict';
import {newer,checkAlecRelease} from './alec-update.mjs';
const release={tag_name:'v1.2.0',draft:false,prerelease:false,body:'Novidades'};
const request=(body,status=200)=>async()=>({status,ok:status===200,json:async()=>body});
test('numeric versions',()=>{assert.ok(newer('1.10.0','1.9.0'));assert.ok(!newer('1.0.0','1.0.0'));assert.ok(!newer('2.0.0-beta','1.0.0'));});
test('stable release only',async()=>{const r=await checkAlecRelease('1.0.0',{request:request(release)});assert.equal(r.state,'available');assert.equal(r.version,'1.2.0');assert.equal(r.notes,'Novidades');for(const flag of ['draft','prerelease'])assert.equal((await checkAlecRelease('1.0.0',{request:request({...release,[flag]:true})})).state,'no-release');});
test('missing release and network errors',async()=>{assert.equal((await checkAlecRelease('1.0.0',{request:request(null,404)})).state,'no-release');await assert.rejects(checkAlecRelease('1.0.0',{request:request(null,403)}));});
test('reject invalid local version and downgrade',async()=>{await assert.rejects(checkAlecRelease('bad',{request:request(release)}));assert.equal((await checkAlecRelease('2.0.0',{request:request(release)})).state,'current');});
