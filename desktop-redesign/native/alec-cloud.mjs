// Local envelope only. No network, account credential export, or permission transfer.
// Import/export deliberately accepts only individually approved structured knowledge records.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const types=new Set(['preference','knowledge','skill']);
const secret=/password|passphrase|palavra.passe|senha|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|bearer\s|private[ _-]?key|secret|credential|credencia|bank|banc[áa]ri|iban|cart[ãa]o|credit.card|cvv|oauth|social.media|rede[s]? socia|(?:\d[ -]?){13,19}|-----BEGIN/i;
const maxBytes=1024*1024;
const header=Buffer.from('ALEC-CLOUD-v1');
function safeText(v,max){return typeof v==='string'&&v.length>0&&v.length<=max&&!secret.test(v)&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v);}
function keyCheck(key){if(!Buffer.isBuffer(key)||key.length!==32)throw Error('A 256-bit locally managed key is required');}
function validate(records){
 if(!Array.isArray(records)||records.length>200)throw Error('Invalid knowledge collection');
 const ids=new Set();
 return records.map(r=>{
  if(!r||Object.getPrototypeOf(r)!==Object.prototype||!types.has(r.type)||r.approved!==true||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(r.id)||ids.has(r.id)||!safeText(r.title,160)||!safeText(r.text,4000))throw Error('Record requires review or contains prohibited data');
  ids.add(r.id);
  // Never serialize arbitrary metadata, paths, permissions, tokens, or device identities.
  return {id:r.id,type:r.type,title:r.title,text:r.text,approved:true};
 });
}
export function sealKnowledge(records,key){
 keyCheck(key);const bytes=Buffer.from(JSON.stringify(validate(records)));if(bytes.length>maxBytes)throw Error('Knowledge limit');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);
 const data=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return Buffer.concat([header,iv,cipher.getAuthTag(),data]).toString('base64');
}
export function openKnowledge(envelope,key){
 keyCheck(key);if(typeof envelope!=='string'||envelope.length>Math.ceil((maxBytes+64)*4/3)||!/^[A-Za-z0-9+/]+={0,2}$/.test(envelope))throw Error('Invalid envelope');
 const raw=Buffer.from(envelope,'base64'),n=header.length;
 if(raw.length<n+28||!raw.subarray(0,n).equals(header))throw Error('Unknown envelope version');
 const decipher=createDecipheriv('aes-256-gcm',key,raw.subarray(n,n+12));decipher.setAAD(header);decipher.setAuthTag(raw.subarray(n+12,n+28));
 const data=Buffer.concat([decipher.update(raw.subarray(n+28)),decipher.final()]);
 if(data.length>maxBytes)throw Error('Knowledge limit');
 // Restored content is a review candidate, never an authorization to execute.
 return validate(JSON.parse(data.toString('utf8'))).map(({approved,...r})=>({...r,approved:false}));
}
