import test from 'node:test';
import assert from 'node:assert/strict';
import {newer,checkAlecRelease} from './alec-update.mjs';
const release={tag_name:'v1.2.0',draft:false,prerelease:false,body:'Novidades'};
const request=(body,status=200)=>async()=>({status,ok:status===200,json:async()=>body});
test('numeric versions',()=>{assert.ok(newer('1.10.0','1.9.0'));assert.ok(!newer('1.0.0','1.0.0'));assert.ok(!newer('2.0.0-beta','1.0.0'));});
test('stable release only',async()=>{const r=await checkAlecRelease('1.0.0',{request:request(release)});assert.equal(r.state,'available');assert.equal(r.version,'1.2.0');assert.equal(r.notes,'Novidades');for(const flag of ['draft','prerelease'])assert.equal((await checkAlecRelease('1.0.0',{request:request({...release,[flag]:true})})).state,'no-release');});
test('missing release and network errors',async()=>{assert.equal((await checkAlecRelease('1.0.0',{request:request(null,404)})).state,'no-release');await assert.rejects(checkAlecRelease('1.0.0',{request:request(null,403)}));});
test('reject invalid local version and downgrade',async()=>{await assert.rejects(checkAlecRelease('bad',{request:request(release)}));assert.equal((await checkAlecRelease('2.0.0',{request:request(release)})).state,'current');});

test('preview opt-in selects highest numeric release, skips drafts and invalid tags',async()=>{const feed='https://github.com/Mula-Edmilson/alec-ola-alec-build/releases/download/v1.4.0/latest.json';const r=await checkAlecRelease('1.0.0',{channel:'preview',request:request([release,{...release,tag_name:'v1.4.0',prerelease:true,assets:[{name:'latest.json',browser_download_url:feed,state:'uploaded'}]},{...release,tag_name:'v9.0.0',draft:true},{...release,tag_name:'v01.9.0'}])});assert.equal(r.version,'1.4.0');assert.equal(r.channel,'preview');assert.equal(r.hasFeed,true);});
test('untrusted or missing manifest cannot enable install',async()=>{const r=await checkAlecRelease('1.0.0',{request:request({...release,assets:[{name:'latest.json',state:'uploaded',browser_download_url:'https://evil.example/latest.json'}]})});assert.equal(r.hasFeed,false);await assert.rejects(checkAlecRelease('1.0.0',{channel:'other',request:request(release)}));});
