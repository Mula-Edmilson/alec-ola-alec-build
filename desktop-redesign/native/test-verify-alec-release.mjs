import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {verifyRelease} from './verify-alec-release.mjs';
test('package consistency guard',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alec-release-'));
 const version='0.2.0',asset='ALEC-Desktop-0.2.0-Preview-x64-setup.exe';
 const installer=Buffer.from('MZ synthetic installer'),sig='A'.repeat(100);
 const manifest={version,platforms:{'windows-x86_64':{signature:sig,url:'https://github.com/Mula-Edmilson/alec-ola-alec-build/releases/download/v'+version+'/'+asset}}};
 const write=(name,data)=>fs.writeFileSync(path.join(dir,name),data);
 try{
 write(asset,installer);write(asset+'.sig',sig);write('SHA256.txt',createHash('sha256').update(installer).digest('hex')+'  '+asset);write('latest.json',JSON.stringify(manifest));
 assert.equal(verifyRelease(dir,version).asset,asset);
 write(asset,Buffer.from('MZ tampered'));assert.throws(()=>verifyRelease(dir,version),/hash mismatch/);write(asset,installer);
 write(asset+'.sig','B'.repeat(100));assert.throws(()=>verifyRelease(dir,version),/Signature/);write(asset+'.sig',sig);
 manifest.platforms['windows-x86_64'].url='https://example.com/installer.exe';write('latest.json',JSON.stringify(manifest));assert.throws(()=>verifyRelease(dir,version),/manifest/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
