// Package consistency only: cryptographic trust is enforced by Tauri on installation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export function verifyRelease(dir,version){
 if(!/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(version))throw Error('Invalid release version');
 const asset='ALEC-Desktop-'+version+'-Preview-x64-setup.exe';
 const get=n=>fs.readFileSync(path.join(dir,n));
 const manifest=JSON.parse(get('latest.json').toString('utf8'));
 const platform=manifest.platforms?.['windows-x86_64'];
 const url='https://github.com/Mula-Edmilson/alec-ola-alec-build/releases/download/v'+version+'/'+asset;
 if(manifest.version!==version||platform?.url!==url||Object.keys(manifest.platforms??{}).length!==1)throw Error('Invalid release manifest');
 const sig=get(asset+'.sig').toString('utf8').trim();
 if(!/^[A-Za-z0-9+/=]{40,4096}$/.test(sig)||platform.signature!==sig)throw Error('Signature missing or mismatched');
 const installer=get(asset);
 if(installer.length<2||installer.toString('ascii',0,2)!=='MZ')throw Error('Installer is not a Windows executable');
 const hash=createHash('sha256').update(installer).digest('hex');
 if(get('SHA256.txt').toString('utf8').trim()!==hash+'  '+asset)throw Error('Installer hash mismatch');
 return {version,asset,hash};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const version=JSON.parse(fs.readFileSync(new URL('./alec-version.json',import.meta.url),'utf8')).version;
 console.log(verifyRelease(process.argv[2]||'candidate',version));
}
