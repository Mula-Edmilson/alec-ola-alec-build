// Portable local export; the passphrase is never stored or included in panel state.
import {randomBytes,scrypt as derive} from 'node:crypto';
import {promisify} from 'node:util';
import {sealKnowledge,openKnowledge} from './alec-cloud.mjs';
const scrypt=promisify(derive);
const prefix='ALEC1.';
async function keyFor(passphrase,salt){
 if(typeof passphrase!=='string'||passphrase.length<16||passphrase.length>256)throw Error('Usa uma frase-passe de 16 a 256 caracteres.');
 return scrypt(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
}
export async function exportPortable(records,passphrase){
 const salt=randomBytes(16),key=await keyFor(passphrase,salt);
 try{return prefix+salt.toString('hex')+'.'+sealKnowledge(records,key);}
 finally{key.fill(0);}
}
export async function importPortable(value,passphrase){
 if(typeof value!=='string'||value.length>1400000||!value.startsWith(prefix))throw Error('Cópia ALEC inválida.');
 const salt=value.slice(prefix.length,prefix.length+32);
 if(!/^[a-f0-9]{32}$/.test(salt)||value[prefix.length+32]!=='.')throw Error('Cópia ALEC inválida.');
 const key=await keyFor(passphrase,Buffer.from(salt,'hex'));
 try{return openKnowledge(value.slice(prefix.length+33),key);}
 catch{throw Error('Não foi possível abrir a cópia. Verifica a frase-passe e a integridade.');}
 finally{key.fill(0);}
}
