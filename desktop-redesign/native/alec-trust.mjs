// Pure capability policy. The caller must supply authenticated origin and canonical resource scope.
import {randomUUID} from 'node:crypto';
const capabilities=new Set(['system.read','files.read','files.write','screen.read','camera.read','app.control','command.run','skill.run','skill.learn','cloud.sync','evolution.propose','browser.read','browser.interact','browser.submit']);
const origins=new Set(['desktop','remote','proactive','learn','evolution']);
const maxTTL=24*60*60*1000;
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(v);
const validScope=v=>typeof v==='string'&&v.length>0&&v.length<=2048&&!/[\x00-\x1f]/.test(v)&&v!=='*';
const isOrigin=(v)=>v&&origins.has(v.kind)&&validId(v.id)&&v.verified===true;
export function createTrust({clock=Date.now,audit=()=>{}}={}){
 const grants=new Map();
 const record=(event,fields)=>{audit(Object.freeze({event,time:clock(),...fields}));};
 function grant({capability,origin,scope,ttl,approvedBy}={}){
  if(!capabilities.has(capability)||!isOrigin(origin)||!validScope(scope)||!Number.isSafeInteger(ttl)||ttl<1||ttl>maxTTL||approvedBy!=='local-user')throw Error('Invalid or unapproved grant');
  if(grants.size>=1024)throw Error('Grant limit');
  const entry=Object.freeze({id:randomUUID(),capability,kind:origin.kind,subject:origin.id,scope,expires:clock()+ttl});
  record('grant',{id:entry.id,capability,kind:entry.kind,subject:entry.subject});grants.set(entry.id,entry);return entry;
 }
 function revoke(id){if(!grants.has(id))return false;record('revoke',{id});grants.delete(id);return true;}
 function authorize({capability,origin,scope}={}){
  const now=clock();let match=null;
  if(capabilities.has(capability)&&isOrigin(origin)&&validScope(scope)){
   for(const [id,g] of grants){if(g.expires<=now){grants.delete(id);continue;}if(g.capability===capability&&g.kind===origin.kind&&g.subject===origin.id&&g.scope===scope){match=g;break;}}
  }
  record(match?'allow':'deny',{capability:capabilities.has(capability)?capability:'unknown',kind:origins.has(origin?.kind)?origin.kind:'unknown',grant:match?.id??null});
  return Object.freeze({allowed:!!match,reason:match?'grant':'no-grant',grant:match?.id??null});
 }
 return Object.freeze({grant,revoke,authorize,list:()=>[...grants.values()].filter(g=>g.expires>clock())});
}
