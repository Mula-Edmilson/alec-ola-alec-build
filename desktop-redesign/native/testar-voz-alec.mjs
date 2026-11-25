import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseFishReference,createVoicePreference,voiceDirectory,aboutAlec} from './alec-voice-preference.mjs';
const a='1234567890abcdef1234567890abcdef',b='abcdef1234567890abcdef1234567890';
assert.equal(parseFishReference(a.toUpperCase()),a);
for(const url of ['https://fish.audio/m/'+a+'/', 'https://fish.audio/pt/m/'+a+'?utm_source=test','https://www.fish.audio/model/'+a])assert.equal(parseFishReference(url),a);
for(const invalid of ['','javascript:alert(1)','https://fish.audio.evil.test/m/'+a,'http://fish.audio/m/'+a,'https://fish.audio@evil.test/m/'+a,'https://fish.audio/m/not-id','https://fish.audio/m/'+a+'/extra','https://fish.audio:9999/m/'+a,'https://fish.audio/?id='+a])assert.throws(()=>parseFishReference(invalid));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'alec-voice-test-'));
try{
 const directory=voiceDirectory({ROAMIES_DATA_DIR:root},'/unused');
 const v=createVoicePreference({directory,legacyVoice:a});assert.equal(v.get(),a);
 assert.equal(createVoicePreference({directory,legacyVoice:b}).get(),a);
 v.save('https://fish.audio/m/'+b+'/');assert.equal(v.get(),b);
 assert.throws(()=>v.save('invalid'));assert.equal(v.get(),b);
 assert.equal(createVoicePreference({directory}).get(),b);
 v.reset();assert.equal(createVoicePreference({directory,legacyVoice:a}).get(),'');
 fs.writeFileSync(path.join(directory,'fish-voice.json'),'{');const bad=createVoicePreference({directory,legacyVoice:a});assert.equal(bad.get(),'');assert.ok(bad.problem());assert.equal(fs.readFileSync(path.join(directory,'fish-voice.json'),'utf8'),'{');bad.save(a);assert.equal(bad.get(),a);
 const guide=aboutAlec({name:'Amilcar',looks:['ALEC','Amilcar']});assert.match(guide,/Definições > Voz e áudio/);assert.match(guide,/ALEC Remote/);assert.match(guide,/não foram disponibilizados/);assert.match(guide,/Amilcar/);
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log('ALEC voice preferences: strict URLs, legacy migration, persistence, reset, invalid/corrupt input and manual passed.');
